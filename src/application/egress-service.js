"use strict";

const { createAuditEvent } = require("../core/events.js");
const { evaluatePolicy } = require("../core/policies.js");
const { CLASSIFICATIONS, redactValue } = require("../core/security.js");

function evaluateEgress(action, input = {}) {
  const redacted = redactValue(input.payload || {});
  const decision = evaluatePolicy(action, {
    classification: input.classification || redacted.classification || CLASSIFICATIONS.UNKNOWN,
    external: true,
    dryRunCompleted: Boolean(input.dryRunCompleted),
    idempotencyKey: input.idempotencyKey,
    confirmed: Boolean(input.confirmed),
    requiresConsent: Boolean(input.requiresConsent),
    consent: Boolean(input.consent),
    budgetOk: input.budgetOk !== false,
  });
  return {
    schemaVersion: 1,
    ok: decision.ok,
    action,
    policy: decision.policy,
    reason: decision.reason,
    redactedPayload: redacted.value,
    requiredConfirmations: decision.requiredConfirmations || [],
    auditEvent: createAuditEvent({
      type: decision.ok ? "egress.allowed" : "egress.blocked",
      source: "egress-service",
      status: decision.ok ? "succeeded" : "blocked",
      safeSummary: `${action}: ${decision.policy}`,
      details: { action, policy: decision.policy, reason: decision.reason, payload: redacted.value },
    }),
  };
}

module.exports = {
  evaluateEgress,
};
