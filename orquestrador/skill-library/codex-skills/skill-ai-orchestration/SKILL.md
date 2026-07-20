---
name: skill-ai-orchestration
description: Use for server-side AI orchestration in SaaS products, including OpenAI, Gemini, Claude, ElevenLabs, streaming, transcription, structured extraction, prompt contracts, token budgets, model routing, queues, retries, observability, consent, validation, and safe API key handling.
category: ai
risk: medium
source: local-ai-orchestration-patterns
---

# AI Orchestration

Use this skill to design or modify AI provider integrations. Keep this file as the compact workflow; load product-specific code only when the task names it.

## Core Workflow

1. Identify the feature, user intent, provider, model, expected output shape, latency target, and cost ceiling.
2. Keep provider keys, organization IDs, refresh tokens, webhook secrets, and signing keys server-side only.
3. Route all AI calls through one server module or gateway that applies auth, quotas, validation, tracing, retries, and redaction.
4. Create durable work records for expensive or long-running calls; run them through queues or workers instead of request handlers.
5. Use idempotency keys for retries, dedupe, tool calls, media generation, transcription jobs, and webhook callbacks.
6. Version prompts and schemas by feature. Store prompt hash, schema version, model, temperature, and evaluation notes with each request.
7. Validate every structured response against a schema before writing business state or triggering external actions.
8. Minimize tokens: send only task-relevant fields, summarize or chunk long context, cache stable inputs, and store reusable embeddings or transcripts.
9. Require explicit user consent before generating, cloning, publishing, or sending content that uses personal data, voice, likeness, customer messages, or third-party media.
10. Emit sanitized observability: feature, tenant, model, token estimate, cost estimate, latency, retry count, queue age, and failure class.

## Service Contract

- `ai_requests`: tenant ID, actor ID, feature, provider, model, prompt version, status, idempotency key, queue job ID, token estimate, cost estimate, latency, error class.
- `prompt_versions`: feature, version, system prompt hash, output schema, allowed tools, evaluation set, rollout state.
- `ai_outputs`: request ID, output type, schema version, storage path or redacted text, moderation state, review state, retention deadline.
- `ai_budget_events`: tenant ID, feature, provider, units, estimated cost, quota bucket, created time.

## Guardrails

- Never expose provider secrets in browser bundles, mobile clients, logs, analytics events, screenshots, or error payloads.
- Never trust model output as executable instruction. Validate, authorize, and constrain tool calls with allowlists.
- Do not retry non-idempotent side effects unless the operation has a stable idempotency key and confirmed dedupe.
- Use streaming only when partial output improves the user experience; keep final validated output as the source of truth.
- Apply tenant, user, feature, and provider-level rate limits before creating expensive jobs.
- Store raw prompts and raw outputs only when the product has a retention need and the user has consented.

## Verification

- Test success, provider timeout, rate limit, malformed output, quota exceeded, cancellation, duplicate retry, and worker resume paths.
- Inspect built client artifacts or environment exposure to confirm no provider secret is shipped.
- Validate token reduction with a representative long input and confirm the schema validator rejects invalid output.
- Confirm audit events and cost records are written for both synchronous and queued calls.

## Related Skills

- `skill-live-processing`
- `skill-smart-clip-detection`
- `skill-elevenlabs-voice-cloning`
- `skill-unified-analytics`

