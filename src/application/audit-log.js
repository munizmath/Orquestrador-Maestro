"use strict";

const fs = require("node:fs");
const { createAuditEvent } = require("../core/events.js");
const { assertSchema } = require("../core/schemas.js");

function appendAuditEvent(store, input, deps = {}) {
  store.ensure();
  const event = assertSchema("AuditEvent", input.schemaVersion ? input : createAuditEvent(input, deps));
  const filePath = store.path("audit", "events.ndjson");
  fs.mkdirSync(require("node:path").dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

function readAuditEvents(store) {
  const filePath = store.path("audit", "events.ndjson");
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

module.exports = {
  appendAuditEvent,
  readAuditEvents,
};
