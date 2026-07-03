# billing-flows.md — Reference for skill-cobranca-automatizada-saas-abacatepay

## Flow 1: Dunning Execution (Cron)

### Trigger
Cron schedule: 8:00, 12:00, 16:00 BRT (`billing-cron.ts`)

### Pseudocode
```
processAllBillings(owner_id):
  config = resolveBillingConfig(owner_id)
  overdue = SELECT * FROM cobrancas
    WHERE status = 'overdue'
    AND owner_id = ?owner_id
    AND billing_config_id = ?config.id

  FOR EACH cobranca IN overdue:
    regua = getActiveRegua(owner_id)
    eventos = getEnabledEventos(regua.id) ORDER BY order

    already_fired = getFiredEventos(cobranca.id)
    next_evento = findNextEvento(eventos, already_fired, cobranca.due_date)

    IF next_evento IS NULL:
      // All events fired, cancel cobranca
      UPDATE cobrancas SET status = 'cancelled', cancelled_at = NOW()
      RETURN

    IF dias_apos_vencimento met:
      sendNotification(cobranca, next_evento)
      logFiredEvento(cobranca.id, next_evento.id)
```

### Key Functions

`criarCobranca`: creates cobranca + creates AbacatePay billing via `abacatepay-create-billing-v2.ts`
- Validates user has active billing_config
- Creates customer if needed (AbacatePay customer lookup by email)
- Creates billing with PIX or CARD methods
- Stores pix_qrcode, pix_qrcode_text, payment_url, billing_id
- Returns { cobranca, billing }

`processCobrancaPayments`: processes pending cobrancas for a user
- Called when user triggers payment from PlansPage or admin
- Calls criarCobranca for each pending item
- Returns list of cobrancas with payment URLs

## Flow 2: Webhook Processing

### Entry
POST /api/abacatepay-webhook

### Steps
1. Extract signature from header `x-abacatepay-signature` or similar
2. Verify HMAC-SHA256 using stored abacatepay_config.api_key
3. Rate limit: 100 requests/min/IP (in-memory counter)
4. Store raw event in `abacatepay_events` (idempotent by event_id)
5. Dispatch by event_type:

**billing.paid**:
```
processPayment(event):
  cobranca = SELECT * FROM cobrancas WHERE billing_id = ?event.billing_id
  IF cobranca.status = 'paid':
    RETURN (idempotent)

  BEGIN TRANSACTION:
    UPDATE cobrancas SET
      status = 'paid',
      paid_at = NOW(),
      payment_method = ?event.method
    WHERE id = ?cobranca.id

    UPDATE cobranca_tracking SET
      status = 'active',
      current_billing_id = ?event.billing_id,
      last_billing_at = NOW()
    WHERE user_id = ?cobranca.user_id

    UPDATE front_users SET
      status = 'active',
      plano_id = ?cobranca.plano_id
    WHERE id = ?cobranca.user_id

  INSERT INTO transaction_log (...)
```

**billing.overdue** / **billing.expired**:
```
processOverdue(event):
  cobranca.id → UPDATE status = 'overdue'
```

**billing.refunded**:
```
processRollback(event):
  cobranca = SELECT * WHERE billing_id = ?event.billing_id
  IF cobranca.status != 'paid':
    RETURN

  BEGIN TRANSACTION:
    UPDATE cobrancas SET status = 'refunded', refunded_at = NOW()
    // Optionally revert plan access
    UPDATE cobranca_tracking SET status = 'cancelled'
    WHERE user_id = ?cobranca.user_id
    AND current_billing_id = ?cobranca.billing_id
```

## Flow 3: Trial Management

### Cron (every 5 min — trial-cron.ts)

```
checkTrials():
  // Pre-expiration notifications
  candidates = SELECT * FROM front_users WHERE
    trial_end IS NOT NULL
    AND status = 'active'
    AND trial_end BETWEEN NOW() AND NOW() + INTERVAL '7 days'

  FOR EACH user IN candidates:
    days_remaining = DATEDIFF('day', NOW(), user.trial_end)
    IF days_remaining IN (7, 3, 1):
      IF not yet notified for this threshold:
        sendTrialNotification(user, days_remaining)

  // Expiration
  expired = SELECT * FROM front_users WHERE
    trial_end < NOW()
    AND status = 'active'

  FOR EACH user IN expired:
    UPDATE front_users SET status = 'blocked', blocked_at = NOW()
    notifyTrialExpired(user)
    INSERT INTO transaction_log (...)
```

### Main Cron (8/12/16h — billing-cron.ts) also handles:
- Trial notifications (duplicated for coverage)
- Trial expiration (duplicated for coverage)
- Billing metrics at midnight (00:00 BRT)

## Flow 4: Invoice Portal

### Flow
1. User receives notification with link: `https://app.example.com/fatura/{shortlink}`
2. FaturaPage loads, calls `GET /api/fatura/{shortlink}`
3. Server materializes cobranca from DB + fetches latest billing status from AbacatePay
4. Returns: amount, due_date, status, pix_qrcode, pix_qrcode_text, payment_url, plano_nome
5. Frontend renders:
   - Status badge (pending/paid/overdue/cancelled)
   - PIX QR Code for immediate payment
   - "Pagar com Cartão" button → payment_url
   - "Compartilhar no WhatsApp" → pre-formatted message
6. Polls `GET /api/fatura/{shortlink}/status` every 5 seconds
7. On status = 'paid', show success state

## Flow 5: Plan Change / Subscription

### User-Initiated (PlanManager)
1. User clicks "Assinar" or "Trocar Plano" on PlansPage
2. Creates cobranca via `criarCobranca` with new plano_id
3. User redirected to AbacatePay checkout or sees PIX QR Code
4. On webhook billing.paid: plan is updated, cobranca_tracking created/updated

### Recurring (Cron)
1. For active cobranca_tracking entries with next_billing_at past due:
2. Auto-create new cobranca via criarCobranca
3. Send notification with payment link
4. Wait for webhook confirmation
