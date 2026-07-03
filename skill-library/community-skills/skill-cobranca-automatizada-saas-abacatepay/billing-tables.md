# billing-tables.md — Reference for skill-cobranca-automatizada-saas-abacatepay

## Table: cobrancas

Core billing record. One row per charge/invoice.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Primary key |
| user_id | uuid FK → front_users | Owner of the cobranca |
| owner_id | text | Tenant/account identifier |
| plano_id | uuid FK → planos | Associated plan |
| status | cobranca_status | pending, paid, overdue, cancelled, refunded |
| amount | integer | Value in BRL cents |
| due_date | timestamptz | Due date for payment |
| paid_at | timestamptz | When payment was confirmed |
| cancelled_at | timestamptz | When cancelled |
| refunded_at | timestamptz | When refunded |
| billing_id | text | AbacatePay billing ID (external) |
| shortlink | text(8) | Unique 8-char URL slug for invoice page |
| payment_method | text | PIX or CARD |
| pix_qrcode | text | PIX QR Code payload |
| pix_qrcode_text | text | PIX copy-paste code |
| payment_url | text | AbacatePay checkout URL |
| metadata | jsonb | Extra data (plan name, etc.) |
| billing_config_id | uuid | Reference to billing_config used |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update |

Indexes:
- `idx_cobrancas_user_id` ON user_id
- `idx_cobrancas_status` ON status
- `idx_cobrancas_due_date` ON due_date
- `idx_cobrancas_shortlink` UNIQUE ON shortlink
- `idx_cobrancas_billing_id` ON billing_id
- `idx_cobrancas_owner_status` ON (owner_id, status)

Trigger: `gerar_cobranca_shortlink` — auto-generates unique 8-char shortlink on INSERT.

## Table: cobranca_reguas

Dunning rule set (régua de cobrança). One set per tenant/owner.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Primary key |
| owner_id | text | Tenant identifier |
| nome | text | Display name (e.g. "Régua Padrão") |
| ativa | boolean | Whether this rule set is active |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Index: `idx_cobranca_reguas_owner` ON owner_id

## Table: cobranca_regua_eventos

Individual dunning events within a rule set. Ordered by order field.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Primary key |
| regua_id | uuid FK → cobranca_reguas | Parent rule set |
| order | integer | Execution order |
| dias_apos_vencimento | integer | Days after due date to fire this event |
| canal | text | email, whatsapp, or ambos |
| template_assunto | text | Email subject (with {{variables}}) |
| template_corpo | text | Message body (with {{variables}}) |
| habilitado | boolean | Whether this event is active |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Index: `idx_eventos_regua` ON regua_id

## Table: billing_config

Encrypted integration configurations per owner.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Primary key |
| owner_id | text UNIQUE | Tenant identifier |
| resend_config | text | Encrypted JSON: api_key, from_email |
| evolution_config | text | Encrypted JSON: api_url, api_key, instance |
| abacatepay_config | text | Encrypted JSON: api_key |
| trial_duration_days | integer | Trial period in days |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Encryption: AES-256-GCM via BILLING_CONFIG_ENCRYPTION_KEY environment variable.
See `billing-config.md` for encryption/decryption logic.

## Table: front_users

User/account profiles with billing-relevant columns.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Primary key |
| owner_id | text | Tenant/account identifier |
| nome | text | User display name |
| email | text | User email (for Resend) |
| celular | text | Phone number (for Evolution API) |
| plano_id | uuid FK → planos | Current plan |
| status | user_status | active, blocked, etc. |
| trial_start | timestamptz | When trial began |
| trial_end | timestamptz | When trial ends/ended |
| blocked_at | timestamptz | When blocked |

## Table: partner_billing_config

Partner-specific billing configuration and plan mapping.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Primary key |
| partner_id | text | Partner identifier |
| owner_id | text | Mapped tenant |
| planos_permitidos | jsonb | Allowed plan IDs/names |
| config_override | jsonb | Override billing config values |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## Table: cobranca_tracking

Subscription/recurring billing tracking. Links cobrancas cycles per user.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Primary key |
| user_id | uuid FK | User |
| owner_id | text | Tenant |
| plano_id | uuid FK | Plan |
| status | text | active, cancelled, etc. |
| current_billing_id | text | Active cobranca billing_id |
| last_billing_at | timestamptz | |
| next_billing_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## Table: abacatepay_events

Raw webhook event storage for idempotency and debugging.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Primary key |
| event_id | text UNIQUE | AbacatePay event ID |
| event_type | text | e.g. billing.paid |
| billing_id | text | Related AbacatePay billing |
| raw_body | jsonb | Full event payload |
| processed | boolean | Whether processed |
| created_at | timestamptz | |

## Table: transaction_log

Audit log for billing operations.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Primary key |
| user_id | uuid | Affected user |
| action | text | Operation name |
| before_state | jsonb | State before |
| after_state | jsonb | State after |
| source | text | cron, webhook, admin, user |
| created_at | timestamptz | |

## Enums

```sql
CREATE TYPE cobranca_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled', 'refunded');
CREATE TYPE user_status AS ENUM ('active', 'blocked', 'inactive');
```

## RLS Policies

- `cobrancas`: owner can SELECT own; admin can SELECT/INSERT/UPDATE all
- `billing_config`: only service_role can access (encrypted columns)
- `cobranca_reguas`: owner-specific, admin manages
- `cobranca_regua_eventos`: linked to regua owner
