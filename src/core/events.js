"use strict";

const crypto = require("node:crypto");
const { assertSchema } = require("./schemas.js");
const { CLASSIFICATIONS, redactValue, mergeClassification } = require("./security.js");

function makeEventId(parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

function createAuditEvent(input, deps = {}) {
  const now = deps.now || (() => new Date().toISOString());
  const redact = redactValue(input.details || {});
  const classification = mergeClassification(input.classification || CLASSIFICATIONS.PUBLIC_SAFE, redact.classification);
  const timestamp = input.timestamp || now();
  const event = {
    schemaVersion: 1,
    eventId: input.eventId || makeEventId([input.type, timestamp, input.source || "local", input.safeSummary || ""]),
    type: input.type,
    timestamp,
    source: input.source || "local",
    actor: input.actor || "local-user",
    status: input.status || "succeeded",
    safeSummary: redactValue(input.safeSummary || input.type).value,
    redactedDetails: redact.value,
    classification,
    retention: input.retention || "default",
  };
  return assertSchema("AuditEvent", event);
}

module.exports = {
  createAuditEvent,
};
