# SaaS Security and Infra Checklist

## Secrets

- Browser code may use only public/anon keys intended for browser use.
- Service-role keys, payment API keys, webhook secrets, OpenAI keys, and admin tokens stay server-side.
- Check `.env*`, Netlify/Vercel/Render/Fly/Coolify envs, and CI variables before debugging provider failures.

## Supabase

- RLS must be enabled for user-facing tables.
- Policies must include tenant/user ownership and role membership checks.
- Storage buckets need explicit read/write policies.
- Prefer RPC or backend routes for transactional multi-table operations.

## API

- Validate inputs with the project standard library.
- Add rate limits for auth, checkout, webhook-adjacent public endpoints, AI endpoints, and file uploads.
- Use CORS allowlists for production APIs.
- Add structured errors that do not leak stack traces or secrets.

## Verification

- Build/typecheck/lint before claiming implementation complete.
- Run local defensive scans for secrets and dependencies on security-sensitive work.
- Simulate provider webhooks in test mode before production changes.
- For DAST/recon, scan only owned and explicitly authorized preview/staging URLs.
