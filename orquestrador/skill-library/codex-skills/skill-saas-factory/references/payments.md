# SaaS Payments Checklist

## Provider Selection

- Use AbacatePay when the product needs Brazilian PIX/card flows, CPF/CNPJ, local checkout expectations, or BRL-first billing.
- Use Stripe when the product needs international cards, mature subscriptions, customer portal, invoices, coupons, trials, proration, or Connect marketplaces.
- Keep provider-specific code isolated behind a project payment service so plans/entitlements do not depend on provider object shapes.

## Required Tables

- `plans`: name, display name, active flag, price, currency, interval, feature limits.
- `subscriptions` or `user_entitlements`: user/tenant, plan, status, current period, grace, provider, provider IDs.
- `payment_events`: provider, event ID, event type, received timestamp, processed timestamp, status, error, retry count.
- `payments` or `payment_history`: amount, currency, status, paid/refunded/cancelled timestamps, provider billing/session/payment IDs.
- `audit_logs`: admin/manual changes and entitlement overrides.

## Webhook Rules

- Verify signatures when the provider supports it.
- Deduplicate by provider event ID and provider billing/session/payment ID.
- Return quickly and push heavy work to an async job when the platform supports it.
- Re-fetch the provider object for critical state changes when event ordering is risky.
- Process only events the integration actually needs.
- Store enough event context for replay and support diagnostics.

## Entitlement Rules

- Payment success updates entitlement status and access expiration in the database.
- Refund/cancel/failure transitions must reduce or suspend access according to product policy.
- UI reads entitlements from the backend/database, not from checkout redirects alone.
- Add admin override paths with audit logs for support and manual recovery.
