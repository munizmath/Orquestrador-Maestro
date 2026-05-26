---
name: skill-evolution-api
description: Use for WhatsApp automation with Evolution API, including instance lifecycle, QR pairing, inbound and outbound messages, webhooks, consent, tenant isolation, queues, idempotency, rate limits, retries, audit logs, and reliable delivery.
category: communication
risk: medium
source: evolution-api-local-patterns
---

# Evolution API

Use this skill when integrating WhatsApp through Evolution API. Treat every message as sensitive customer communication.

## Core Workflow

1. Confirm the tenant, WhatsApp account owner, business purpose, user consent model, and allowed message categories.
2. Keep Evolution API keys, webhook secrets, and instance credentials server-side only.
3. Model each instance as tenant-owned state with lifecycle, QR pairing state, webhook status, heartbeat, and disconnect reason.
4. Queue outbound sends. Apply per-instance, per-tenant, and per-contact rate limits before enqueueing.
5. Assign every outbound request a stable idempotency key based on tenant, instance, recipient, template or body hash, and campaign or workflow ID.
6. Treat webhooks as at-least-once delivery. Verify signature when available, dedupe by provider message ID, and make handlers idempotent.
7. Persist delivery, read, inbound, disconnect, reconnect, and pairing events as append-only state transitions.
8. Redact message bodies in logs unless a support or audit policy explicitly requires short-lived encrypted retention.
9. Surface recoverable admin states: QR expired, disconnected, webhook failing, send queued, send failed, rate limited, and consent missing.

## Consent and Compliance

- Require explicit opt-in before sending non-transactional messages.
- Store consent source, timestamp, contact identity, tenant, scope, and revocation timestamp.
- Stop queued campaign or automation messages immediately when consent is revoked.
- Keep templates, campaign labels, and operator identity attached to sends for audit.

## Minimal Data Model

- `whatsapp_instances`: tenant ID, owner ID, instance name, status, QR state, webhook status, last heartbeat, disconnect reason.
- `whatsapp_contacts`: tenant ID, normalized number, profile name, consent state, consent scope, last inbound time.
- `message_events`: tenant ID, instance ID, provider message ID, idempotency key, direction, status, retry count, error class, timestamps.
- `message_threads`: tenant ID, contact ID, assignment state, last message time, unread count.

## n8n + Evolution API

Use n8n as workflow glue, not as the only reliability layer.

1. Point Evolution webhooks at an authenticated gateway when possible, then forward sanitized events to n8n.
2. If Evolution calls n8n directly, require a secret header or signed URL, normalize payloads in the first node, and dedupe before side effects.
3. Store instance lifecycle outside n8n execution history: pairing requested, QR generated, QR expired, connected, disconnected, reconnecting, and blocked.
4. Keep outbound send requests behind a queue or gateway endpoint. n8n should enqueue, not loop directly over many contacts.
5. Attach `tenantId`, `instanceId`, `contactRef`, `workflowId`, `idempotencyKey`, and consent scope to every n8n handoff.
6. Route AI replies through `skill-ai-orchestration` or `skill-n8n-whatsapp-claude` patterns before sending WhatsApp messages.
7. Add operator-visible failures for webhook not delivered, webhook duplicated, QR expired, instance disconnected, rate limited, consent missing, and provider timeout.

## Instance Lifecycle Guardrails

- Treat QR pairing as a state machine with expiration and retry limits.
- Separate WhatsApp Cloud API and Baileys-style instance assumptions in docs and code.
- Do not infer delivery from API acceptance alone; persist provider delivery/read events separately.
- Use heartbeat or status polling to detect silent disconnects.
- Keep media handling behind signed storage or server-side proxy paths, not public URLs in workflow logs.

## Verification

- Test QR pairing, reconnect, disconnect, outbound queueing, duplicate outbound retry, inbound webhook dedupe, revoked consent, and rate-limit behavior.
- Test n8n direct webhook and gateway-forwarded webhook paths when both are supported.
- Replay delivery/read/disconnect events out of order and confirm state transitions remain append-only and recoverable.
- Confirm API keys and message bodies are absent from client bundles and normal logs.
- Replay the same webhook payload twice and verify only one business effect occurs.

## Related Skills

- `skill-saas-admin-dashboard`
- `skill-n8n-whatsapp-claude`
- `skill-ai-orchestration`
- `skill-unified-analytics`
- `skill-security-hooks`
