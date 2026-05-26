---
name: skill-n8n-whatsapp-claude
description: Use for n8n workflows that connect WhatsApp automation with Claude or other LLMs through secure webhooks, queues, idempotency, consent, and provider routing.
category: integrations
risk: medium
source: local-integration-patterns
---

# n8n WhatsApp Claude

Use this skill when a task connects n8n, WhatsApp automation, and Claude or another LLM. Treat n8n as the workflow control plane, not as the place to expose long-lived secrets, raw customer data, or irreversible side effects without guards.

## Core Workflow

1. Identify the business event, WhatsApp channel, Claude task, expected response shape, latency target, retry policy, and human review needs.
2. Keep Evolution API keys, WhatsApp credentials, Anthropic keys, webhook secrets, and tenant identifiers server-side only.
3. Put an authenticated gateway between n8n and providers when possible. n8n should call stable internal endpoints instead of embedding provider-specific secrets in many workflow nodes.
4. Treat inbound WhatsApp webhooks as at-least-once delivery. Verify the source, normalize the payload, and dedupe by provider message ID before invoking Claude or changing business state.
5. Queue outbound WhatsApp sends. Apply tenant, instance, contact, and workflow rate limits before sending.
6. Use stable idempotency keys for n8n executions, Claude calls, outbound messages, retries, and webhook callbacks.
7. Validate Claude output against a schema before sending a message, updating CRM state, creating tasks, or triggering another workflow.
8. Redact message bodies, phone numbers, provider IDs, and prompt text from normal logs. Store raw content only when retention and consent policies require it.
9. Persist a compact audit trail: workflow ID, execution ID, tenant, contact hash, provider message ID hash, model, prompt version, status, retry count, failure class, and timestamps.
10. Prefer small workflows with clear handoff contracts over large n8n canvases that mix parsing, AI prompting, persistence, and delivery in one place.

## Recommended Architecture

```text
WhatsApp/Evolution webhook
  -> gateway webhook endpoint
  -> dedupe + consent + rate-limit checks
  -> queue durable job
  -> n8n workflow execution
  -> internal Claude/LLM gateway
  -> schema validation + policy checks
  -> outbound WhatsApp queue
  -> delivery events + audit
```

Use n8n for orchestration, branching, human approval, admin notifications, and integration glue. Use application code or a gateway for auth, signing, dedupe, quotas, schema validation, encrypted storage, and provider adapters.

## n8n Node Guidance

- Start with the minimal node configuration for each operation, then validate and add optional fields only when needed.
- Prefer a known template or a small reference workflow when the use case matches one. Strip unrelated nodes before adding custom logic.
- Discover node type and operation before configuring fields. Resource and operation determine required fields.
- For HTTP Request nodes, set method, URL, authentication mode, headers, body format, timeout, retry behavior, and response handling explicitly.
- Do not spread provider keys across duplicated workflow nodes. Use n8n credentials only for low-risk integration credentials or call a server gateway.
- Keep workflow input/output contracts stable: `tenantId`, `contactRef`, `messageRef`, `conversationRef`, `intent`, `payload`, `idempotencyKey`, and `schemaVersion`.
- Avoid storing full WhatsApp bodies or Claude outputs in execution history unless the instance is configured with a retention policy that allows it.

## Workflow Checklist

Before deploying or activating a workflow, confirm:

1. Trigger source is explicit: webhook, schedule, manual review, or queue event.
2. Inbound payload is normalized before branching.
3. Tenant, contact, instance, and message references are stable and do not expose raw PII in logs.
4. Duplicate inbound payloads stop before Claude, database writes, or outbound sends.
5. Claude or LLM calls go through one gateway or shared credential boundary.
6. LLM output is schema-validated before any side effect.
7. Outbound WhatsApp delivery is queued and idempotent.
8. Workflow errors produce a recoverable state, not silent failure.
9. Execution history retention is compatible with the sensitivity of WhatsApp content.
10. A replay test confirms duplicate webhooks and retries do not duplicate business effects.

## Validation Ladder

Use the lightest validation that catches the current risk:

- Node validation: required fields, operation-specific fields, credential mode, expression syntax, and current node type version.
- Workflow validation: disconnected nodes, invalid references, missing error paths, stale type versions, and data shape mismatches.
- Runtime validation: representative payload replay through test webhook, duplicate replay, provider timeout, malformed LLM output, and revoked consent.
- Production readiness: secrets absent from workflow export, execution history retention reviewed, rate limits configured, and rollback path known.

If MCP tools for n8n are available, use discovery before configuration and validation before activation. If they are not available, inspect the exported workflow JSON and apply the same ladder manually.

## Claude/LLM Contract

- Version prompts by workflow and intent.
- Include only the minimum conversation context needed for the task.
- Require structured output for automations that trigger side effects.
- Add a refusal or escalation path for unsafe, ambiguous, unsupported, or consent-missing requests.
- Keep model routing, token budgets, retries, and fallback policy in the AI gateway or one shared server module.

## WhatsApp Guardrails

- Require opt-in before non-transactional messages.
- Stop queued sends immediately when consent is revoked.
- Keep templates, campaign labels, workflow IDs, and operator identity attached to sends.
- Surface recoverable states to operators: missing consent, rate limited, QR expired, disconnected, Claude failed validation, workflow failed, and manual review needed.

## Verification

- Replay the same inbound webhook twice and confirm only one Claude request and one business effect occur.
- Retry the same outbound send and confirm the idempotency key prevents duplicates.
- Test missing consent, revoked consent, rate limit, Claude timeout, malformed Claude output, n8n workflow failure, and WhatsApp disconnect.
- Validate node configuration and workflow structure before activation; do not rely on a successful import as proof of correctness.
- Inspect n8n execution history, logs, and exported workflows to confirm secrets and raw sensitive message bodies are absent.
- Confirm audit records are enough to debug delivery without exposing PII.

## Related Skills

- `skill-evolution-api`
- `skill-ai-orchestration`
- `n8n-node-configuration`
- `skill-unified-analytics`
