"use strict";

const { CLASSIFICATIONS } = require("./security.js");

function allow(policy, reason = "allowed") {
  return { ok: true, policy, reason, requiredConfirmations: [] };
}

function deny(policy, reason, requiredConfirmations = []) {
  return { ok: false, policy, reason, requiredConfirmations };
}

function evaluatePolicy(action, context = {}) {
  const classification = context.classification || CLASSIFICATIONS.UNKNOWN;

  if (classification === CLASSIFICATIONS.SECRET) {
    return deny("no-secrets", "secret data is never allowed");
  }

  if (classification === CLASSIFICATIONS.UNKNOWN) {
    return deny("classify-before-action", "unknown classification is blocked");
  }

  if (context.persist && !context.redacted) {
    return deny("redact-before-persist", "payload must be redacted before persistence");
  }

  if (context.external && !context.dryRunCompleted) {
    return deny("dry-run-required", "external actions require a completed dry-run");
  }

  if (context.external && !context.idempotencyKey) {
    return deny("idempotency-required", "external actions require idempotency");
  }

  if (context.external && context.budgetOk === false) {
    return deny("budget-required", "external actions require an approved budget");
  }

  if (context.external && context.rateLimited) {
    return deny("rate-limit", "external action is rate limited");
  }

  if (context.external && !context.confirmed) {
    return deny("external-confirmation-required", "external actions require explicit confirmation", [action]);
  }

  if (context.requiresConsent && !context.consent) {
    return deny("consent-required", "message/channel action requires consent");
  }

  return allow("default-allow");
}

module.exports = {
  evaluatePolicy,
};
