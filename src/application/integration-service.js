"use strict";

const { assertSchema } = require("../core/schemas.js");
const { CLASSIFICATIONS, hashText, redactValue } = require("../core/security.js");
const { evaluatePolicy } = require("../core/policies.js");
const { createAuditEvent } = require("../core/events.js");

const CAPABILITIES = Object.freeze([
  "message.preview",
  "message.send",
  "webhook.emit",
  "llm.complete",
  "workflow.trigger",
  "workflow.status",
]);

function buildIdempotencyKey(intent) {
  return `idem_${hashText(JSON.stringify({
    action: intent.action,
    target: intent.target,
    payload: redactValue(intent.payload || {}).value,
  }))}`;
}

function createIntegrationIntent(input) {
  const payloadResult = redactValue(input.payload || {});
  return assertSchema("IntegrationIntent", {
    schemaVersion: 1,
    id: input.id || `intent_${hashText(`${input.action}:${input.target}:${Date.now()}`)}`,
    action: input.action,
    target: input.target,
    classification: input.classification || payloadResult.classification || CLASSIFICATIONS.UNKNOWN,
    payload: input.payload || {},
  });
}

function dryRunIntegration(input, options = {}) {
  const intent = createIntegrationIntent(input);
  const redacted = redactValue(intent.payload || {});
  const idempotencyKey = options.idempotencyKey || buildIdempotencyKey(intent);
  const policy = evaluatePolicy(intent.action, {
    classification: intent.classification,
    external: true,
    dryRunCompleted: true,
    idempotencyKey,
    confirmed: Boolean(options.confirmed),
    requiresConsent: Boolean(options.requiresConsent),
    consent: Boolean(options.consent),
  });
  const result = assertSchema("DryRunResult", {
    schemaVersion: 1,
    wouldExecute: policy.ok,
    action: intent.action,
    target: intent.target,
    classification: redacted.classification,
    requiredConfirmations: policy.ok ? [] : policy.requiredConfirmations || [policy.policy],
    redactedPayload: redacted.value,
    idempotencyKey,
    risks: policy.ok ? [] : [policy.reason],
  });
  return {
    intent,
    dryRun: result,
    auditEvent: createAuditEvent({
      type: "dry_run.generated",
      source: "integration-service",
      status: policy.ok ? "succeeded" : "blocked",
      safeSummary: `${intent.action} -> ${intent.target}`,
      details: result,
    }),
  };
}

function listCapabilities() {
  return CAPABILITIES.map((name) => ({ name, mode: "mock-or-dry-run" }));
}

module.exports = {
  buildIdempotencyKey,
  createIntegrationIntent,
  dryRunIntegration,
  listCapabilities,
};
