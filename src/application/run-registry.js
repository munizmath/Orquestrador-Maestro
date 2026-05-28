"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { assertSchema, validateSchema } = require("../core/schemas.js");
const { redactValue } = require("../core/security.js");
const { appendAuditEvent } = require("./audit-log.js");

function newRunId(deps = {}) {
  if (deps.id) return deps.id;
  if (deps.randomUUID) return deps.randomUUID();
  return `run_${crypto.randomUUID()}`;
}

function nowIso(deps = {}) {
  return deps.now ? deps.now() : new Date().toISOString();
}

function runPath(runId) {
  return path.join("runs", `${runId}.json`);
}

function createRun(store, input, deps = {}) {
  const startedAt = input.startedAt || nowIso(deps);
  const redactedCommand = input.command ? redactValue(input.command).value : null;
  const run = assertSchema("RunRecord", {
    schemaVersion: 1,
    id: newRunId(deps),
    kind: input.kind || "command",
    status: input.status || "running",
    startedAt,
    completedAt: input.completedAt || null,
    durationMs: input.durationMs || null,
    source: input.source || "cli",
    command: redactedCommand,
    summary: redactValue(input.summary || "Run started").value,
    issues: input.issues || [],
    artifacts: input.artifacts || [],
  });
  store.writeJson(runPath(run.id), run);
  appendAuditEvent(store, {
    type: "run.created",
    source: run.source,
    status: run.status,
    safeSummary: run.summary,
    details: { runId: run.id, kind: run.kind, command: run.command },
    timestamp: startedAt,
  }, deps);
  return run;
}

function updateRun(store, runId, patch, deps = {}) {
  const current = getRun(store, runId);
  if (!current) throw new Error(`Run nao encontrado: ${runId}`);
  const next = assertSchema("RunRecord", {
    ...current,
    ...patch,
    command: patch.command ? redactValue(patch.command).value : current.command,
    summary: patch.summary ? redactValue(patch.summary).value : current.summary,
  });
  store.writeJson(runPath(runId), next);
  appendAuditEvent(store, {
    type: `run.${next.status}`,
    source: next.source,
    status: next.status,
    safeSummary: next.summary,
    details: { runId: next.id, kind: next.kind },
    timestamp: patch.completedAt || nowIso(deps),
  }, deps);
  return next;
}

function getRun(store, runId) {
  const value = store.readJson(runPath(runId), null);
  if (!value) return null;
  const result = validateSchema("RunRecord", value);
  if (!result.ok) {
    return {
      schemaVersion: 1,
      id: runId,
      kind: "corrupt",
      status: "failed",
      startedAt: new Date(0).toISOString(),
      completedAt: null,
      durationMs: null,
      source: "local-store",
      command: null,
      summary: `Run corrompido: ${result.issues.map((item) => item.path).join(", ")}`,
      issues: [],
      artifacts: [],
    };
  }
  return value;
}

function listRuns(store) {
  return store.listJson("runs")
    .map((filePath) => getRun(store, path.basename(filePath, ".json")))
    .filter(Boolean)
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

module.exports = {
  createRun,
  updateRun,
  getRun,
  listRuns,
};
