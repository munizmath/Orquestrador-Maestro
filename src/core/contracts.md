# Core Contracts

Status: local-only implementation note.

The core layer defines stable contracts only. It must not import
`infrastructure`, `application`, `interfaces`, `scripts`, or local state paths.

## Ports

- `RunStore`: create, update, get, list.
- `EventStore`: append, list.
- `TaskQueueStore`: enqueue, lease, complete, fail, cancel, list.
- `PolicyEngine`: evaluate.
- `AuditSink`: write.
- `ConnectorRegistry`: list, get, check.
- `ProviderRegistry`: list, get, check.

## Schema Rules

- Every persisted or externally exposed object has `schemaVersion: 1`.
- Raw payloads are rejected from audit events.
- Operational issues use the shared shape: severity, category, code, message,
  optional location, and recommendation.

## Policy Rules

- Unknown classification blocks external actions.
- Secrets are never allowed.
- Persistence requires redaction first.
- External actions require dry-run, idempotency, and explicit confirmation.
