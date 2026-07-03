# billing-config.md — Reference for skill-cobranca-automatizada-saas-abacatepay

## Architecture

Billing configurations are stored encrypted in `billing_config` table. Each owner (tenant) has one row. The encryption key `BILLING_CONFIG_ENCRYPTION_KEY` is an environment variable on the server.

## Encryption

Algorithm: AES-256-GCM

```
encryptConfig(plaintext):
  key = env.BILLING_CONFIG_ENCRYPTION_KEY
  iv = random 12 bytes
  cipher = AES-256-GCM(key, iv)
  ciphertext = cipher.encrypt(plaintext)
  tag = cipher.tag
  RETURN base64(iv + ciphertext + tag)

decryptConfig(ciphertext_b64):
  raw = base64_decode(ciphertext_b64)
  iv = raw[0:12]
  tag = raw[raw.length-16:]
  ciphertext = raw[12:raw.length-16]
  cipher = AES-256-GCM(key, iv)
  RETURN cipher.decrypt(ciphertext, tag)
```

## Config Resolution

`resolveBillingConfig(owner_id)` returns a fully typed config object:

```typescript
interface BillingIntegrationConfig {
  resend: {
    apiKey: string;
    fromEmail: string;
  };
  evolution: {
    apiUrl: string;
    apiKey: string;
    instance: string;
  };
  abacatepay: {
    apiKey: string;
  };
  trialDurationDays: number;
}
```

Resolution order:
1. Lookup `billing_config` WHERE owner_id = ?owner_id
2. Decrypt each encrypted column individually
3. Parse decrypted JSON into typed interfaces
4. Return combined config object
5. If no config found, throw or return null

## Setup Steps for New Tenant

### Prerequisites
- AbacatePay account with API key
- Resend account with API key and verified sender email
- Evolution API instance (or access to one) with API key
- `BILLING_CONFIG_ENCRYPTION_KEY` set on server

### Admin Configuration
1. Access AdminGlobalSettings in the admin panel
2. Fill in:
   - Resend: API key + from email
   - Evolution: API URL + API key + instance name
   - AbacatePay: API key
   - Trial duration in days
3. Config is encrypted and saved to `billing_config`

### Dunning Setup
1. Go to Admin → Régua de Cobrança
2. Create a rule set (cobranca_reguas): name, active
3. Add events (cobranca_regua_eventos) in order:
   - Event 1: dias_apos_vencimento=0, canal=email, template="..."
   - Event 2: dias_apos_vencimento=3, canal=whatsapp, template="..."
   - Event 3: dias_apos_vencimento=7, canal=ambos, template="..."
4. Activate the rule set

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BILLING_CONFIG_ENCRYPTION_KEY` | Yes | AES-256-GCM key (32 bytes, base64 or raw) |
| `ABACATEPAY_API_KEY` | Fallback | Optional fallback if not in billing_config |
| `RESEND_API_KEY` | Fallback | Optional fallback |
| `EVOLUTION_API_URL` | Fallback | Optional fallback |
| `EVOLUTION_API_KEY` | Fallback | Optional fallback |

## Security Notes

- `BILLING_CONFIG_ENCRYPTION_KEY` must NEVER be logged or exposed
- Each tenant gets a separate billing_config row; cross-tenant access is blocked by owner_id
- Encrypted columns are service_role-only; never exposed via anon key RLS
- Admin UI shows masked values (e.g. "sk_...XXXX") for security
