# SaaS Architecture Checklist

## Baseline Modules

- `public`: landing, pricing/plan teaser, FAQ/social proof when useful, login/signup CTAs.
- `auth`: sign-in, session, onboarding, profile, role/admin checks.
- `tenancy`: tenant/workspace/account context, memberships, owner/admin/member roles.
- `billing`: plans, prices, checkout sessions/billings, webhooks, invoices/receipts, refunds, cancellations.
- `entitlements`: plan limits, feature flags, quota counters, grace period, blocked/expired states.
- `admin`: users, tenants, plans, payments, logs, support/onboarding, metrics.
- `audit`: important state transitions, webhook events, admin actions, security events.
- `observability`: structured server logs, correlation IDs, error boundaries, health checks.

## Database Rules

- Use UUID primary keys, `created_at`, `updated_at`, and clear foreign keys.
- Use explicit status enums or constrained status text for payments/subscriptions.
- Add unique constraints for provider event IDs and provider billing/session IDs.
- Add indexes for admin list filters: `tenant_id`, `user_id`, `status`, `created_at`, provider IDs.
- Enable RLS on user-facing tables and validate service-role access is server-only.

## Frontend Rules

- Use route-level separation for app/admin/public/client portal.
- New SaaS apps should provide a complete public-to-app path: landing -> sign up -> login/session -> onboarding -> app dashboard.
- Landing pages should be real product entry points, not isolated marketing pages without a working app route.
- Registration and login must handle loading, duplicate account, invalid credentials/token, email confirmation, unauthorized, and recovery states when applicable.
- Onboarding should capture only the minimum required product/workspace/profile data and then move the user to the first meaningful action.
- Keep admin screens dense and scannable: metrics, filters, tables, detail drawers, audit trail.
- Use server-derived entitlements for locked features and plan banners.
- Avoid `select('*')` in new Supabase reads; request only fields needed by the component.

## Backend Rules

- Validate all request bodies and query params.
- Keep provider clients behind backend functions/controllers.
- Make payment operations idempotent by design.
- Store raw webhook payload metadata enough for replay/debug, but never log secrets or full PII unnecessarily.
