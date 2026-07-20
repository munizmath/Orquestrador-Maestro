# billing-admin.md — Reference for skill-cobranca-automatizada-saas-abacatepay

## Admin Interfaces

### AdminCobrancas (AdminCobrancas.tsx)
Full CRUD for billing records.

**Features:**
- List all cobranças with filters: status, date range, user, plan
- Create manual cobrança (select user, plan, amount, due_date)
- Edit cobrança (status, amount, due_date)
- Cancel cobrança
- Process payment manually (mark as paid)
- Send test notification (email or WhatsApp)
- View cobrança details: payment history, notification log, AbacatePay link

**Layout:**
- Data table with sortable columns
- Status badges with color coding (pending=yellow, paid=green, overdue=red, cancelled=gray)
- Action buttons per row
- Bulk actions (cancel selected, notify selected)
- Export to CSV

### AdminPlanos (AdminPlanos.tsx)
CRUD for planos (plans/subscription tiers).

**Features:**
- List all plans with: name, code, price, interval, active status
- Create plan: name, code (slug), description, price (in BRL cents), interval (monthly/yearly), features list, trial eligibility
- Edit plan: toggle active/inactive, change price, update features
- Delete plan (soft or with usage check)
- Reorder plans for display
- Plan features as JSON (feature flags, limits)

**Plan Properties:**
```typescript
interface Plano {
  id: string;
  code: string;            // e.g. "basic", "pro", "enterprise"
  nome: string;            // Display name: "Básico", "Profissional"
  descricao: string;
  preco: number;           // BRL cents
  intervalo: 'monthly' | 'yearly';
  ativo: boolean;
  features: Record<string, any>;  // { "max_projects": 5, "ai_credits": 100 }
  trial_eligible: boolean;
  order: number;
}
```

### AdminGlobalSettings (AdminGlobalSettings.tsx)
Global system settings.

**Settings:**
- `trial_duration_days`: Default trial length for new users
- `maintenance_mode`: Toggle system-wide maintenance
- Billing integration config (encrypted):
  - Resend API Key + From Email
  - Evolution API URL + API Key + Instance
  - AbacatePay API Key

**Behavior:**
- Changes take effect immediately
- Config is encrypted before storage
- Fields show masked values; re-entering is required to change
- Validation on save (test connection buttons for each provider)

### MinhasCobrancasSection (MinhasCobrancasSection.tsx)
User-facing invoice list.

**Features:**
- List current user's cobranças
- Show status, amount, due date, plan name
- "Pagar" button → redirects to FaturaPage or AbacatePay checkout
- Filter by status
- Empty state when no cobranças

### PlanManager (PlanManager.tsx)
User-facing plan management (~1800 lines).

**Features:**
- Current plan display with status
- Available plans comparison
- Upgrade/downgrade flow
- Trial status and remaining days
- Billing history
- Cancel subscription
- Reactivate subscription

## Admin API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /api/admin/cobrancas | List all cobranças |
| POST | /api/admin/cobrancas | Create cobrança |
| PUT | /api/admin/cobrancas/:id | Update cobrança |
| DELETE | /api/admin/cobrancas/:id | Delete cobrança |
| POST | /api/admin/cobrancas/:id/notify | Send test notification |
| GET | /api/admin/planos | List plans |
| POST | /api/admin/planos | Create plan |
| PUT | /api/admin/planos/:id | Update plan |
| DELETE | /api/admin/planos/:id | Delete plan |
| GET | /api/admin/settings | Get global settings |
| PUT | /api/admin/settings | Update global settings |

## Guardrails

- Admin actions are logged in transaction_log with source = 'admin'
- Manual payment processing requires confirmation
- Deleting a plan checks for active cobrancas using it
- Cancelling a cobrança with status 'paid' first triggers refund flow
- Global settings changes are audited (previous value stored)
