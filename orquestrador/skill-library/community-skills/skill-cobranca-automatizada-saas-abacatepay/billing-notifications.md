# billing-notifications.md — Reference for skill-cobranca-automatizada-saas-abacatepay

## Architecture

Notifications are dispatched by `billing-sender.ts` which routes to the appropriate channel:

```
sendNotification(cobranca, evento):
  config = resolveBillingConfig(cobranca.owner_id)
  template = renderTemplate(evento.template_corpo, cobranca)

  IF evento.canal IN ('email', 'ambos'):
    sendEmail(config.resend, cobranca.user.email, evento.template_assunto, template)

  IF evento.canal IN ('whatsapp', 'ambos'):
    sendWhatsApp(config.evolution, cobranca.user.celular, template)
```

## Template Variables

All templates support variable interpolation with `{{variable_name}}` syntax:

| Variable | Description | Source |
|---|---|---|
| `{{nome}}` | User's display name | front_users.nome |
| `{{plano}}` | Plan name | planos.nome |
| `{{valor}}` | Amount formatted R$ | cobrancas.amount → "R$ 99,90" |
| `{{vencimento}}` | Due date formatted | cobrancas.due_date → "15/06/2026" |
| `{{link_pagamento}}` | Invoice portal URL | Generated from shortlink |
| `{{empresa_nome}}` | Company/tenant name | From billing_config or app config |
| `{{dias_vencido}}` | Days overdue | Calculated |

## Email Channel (Resend)

### Transport Setup
```typescript
const resend = new Resend(config.apiKey);
```

### Email Template Structure (billing-email-template.ts)
The HTML email template includes:
- Company logo (header)
- Invoice status badge (PENDENTE, PAGA, VENCIDA)
- User greeting: "Olá, {{nome}}!"
- Invoice details table: plano, valor, vencimento
- Payment button (for pending invoices)
- PIX QR Code (inline, when applicable)
- Footer with company info

### HTML Email Structure
```
┌─────────────────────────────────┐
│  [Logo]                         │
│                                 │
│  ┌───────────┐                  │
│  │  PENDENTE │  (status badge)  │
│  └───────────┘                  │
│                                 │
│  Olá, João!                     │
│                                 │
│  Sua fatura do plano Profissional│
│  está disponível para pagamento. │
│                                 │
│  ┌──────────────────────┐       │
│  │ Plano:  Profissional │       │
│  │ Valor:  R$ 99,90     │       │
│  │ Vencimento: 15/06    │       │
│  └──────────────────────┘       │
│                                 │
│  [  Pagar Agora  ]              │
│                                 │
│  [QR Code PIX]                  │
│                                 │
│  Dúvidas? Responda este email.  │
└─────────────────────────────────┘
```

## WhatsApp Channel (Evolution API)

### Transport Setup
```typescript
// POST to Evolution API
fetch(`${config.apiUrl}/message/sendText/${config.instance}`, {
  method: 'POST',
  headers: {
    'apikey': config.apiKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    number: user.celular,  // 55XXXXXXXXXXX format
    text: renderedTemplate,
    delay: 1200
  })
});
```

### Message Format
Plain text with clear CTAs. No rich formatting supported:
```
Olá, {{nome}}!

Sua fatura do plano {{plano}} no valor de {{valor}} venceu há {{dias_vencido}} dias.

Acesse o link para pagar:
{{link_pagamento}}

Se já pagou, desconsidere esta mensagem.
```

## Dunning Sequence (Régua de Cobrança)

Typical sequence configuration:

| Event | Days After Due | Channel | Content |
|---|---|---|---|
| 1 | 0 | email | Invoice notification with payment link |
| 2 | 3 | whatsapp | Gentle reminder, payment link |
| 3 | 5 | email | Second reminder, warning about cancellation |
| 4 | 7 | ambos | Final notice before cancellation |
| 5 | 10 | whatsapp | Cancellation warning, last chance |
| (auto) | 15 | — | Cobrança cancelled by cron |

## Template Management

Templates are stored in `cobranca_regua_eventos.template_corpo` and `template_assunto` columns. They are editable via admin UI.

### Template Rendering
```typescript
renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] || match);
}
```

## Sender Implementation (billing-sender.ts)

```typescript
async function sendBillingNotification(
  cobranca: Cobranca,
  evento: CobrancaReguaEvento,
  config: BillingIntegrationConfig
): Promise<void> {
  const user = await getUser(cobranca.user_id);
  const plano = await getPlano(cobranca.plano_id);
  const vars = {
    nome: user.nome,
    plano: plano.nome,
    valor: formatBRL(cobranca.amount),
    vencimento: formatDate(cobranca.due_date),
    link_pagamento: `${APP_URL}/fatura/${cobranca.shortlink}`,
    empresa_nome: config.empresa_nome || 'Empresa',
    dias_vencido: String(daysBetween(cobranca.due_date, new Date()))
  };

  const body = renderTemplate(evento.template_corpo, vars);

  const results = [];

  if (evento.canal === 'email' || evento.canal === 'ambos') {
    const assunto = renderTemplate(evento.template_assunto, vars);
    const html = buildEmailHtml(cobranca, plano);
    results.push(await sendEmail(config.resend, user.email, assunto, body, html));
  }

  if (evento.canal === 'whatsapp' || evento.canal === 'ambos') {
    results.push(await sendWhatsApp(config.evolution, user.celular, body));
  }

  return results;
}
```

## Guardrails

1. Respect channel preference: if user opted out of WhatsApp, only send email
2. Rate limit WhatsApp messages: max 1 per cobranca per day per event
3. Email templates must include plain-text fallback
4. All notification attempts are logged (success/failure)
5. Evolution API calls include delay parameter to avoid rate limiting
6. Resend API key and Evolution API key NEVER exposed to client
7. Template variables are escaped to prevent injection in email HTML
