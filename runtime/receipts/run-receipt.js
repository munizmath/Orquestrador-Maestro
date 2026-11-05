"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function receiptDirectory(workspacePath) { return path.join(path.resolve(workspacePath), ".orquestrador-maestro", "receipts"); }
function receiptPath(workspacePath, runId) { return path.join(receiptDirectory(workspacePath), `${String(runId).replace(/[^A-Za-z0-9._-]/gu, "_")}.json`); }

function buildRunReceipt({ run, task, workspacePath, terminalEvent = null } = {}) {
  const metadata = run?.metadata || {};
  const resolution = metadata.resolution || {};
  const telemetry = metadata.cognitiveTelemetry || {};
  const delegation = metadata.delegation || {};
  const description = typeof task?.description === "string" ? task.description : "";
  return {
    schemaVersion: 1,
    receiptId: `receipt-${run?.id || "unknown"}`,
    runId: run?.id || null,
    taskId: run?.taskId || task?.id || null,
    projectId: task?.projectId || null,
    workspacePath: path.resolve(workspacePath),
    status: run?.status || "unknown",
    provider: run?.providerId || null,
    intentSha256: description ? crypto.createHash("sha256").update(description, "utf8").digest("hex") : null,
    createdAt: run?.createdAt || null,
    startedAt: run?.startedAt || null,
    completedAt: run?.completedAt || null,
    terminalReason: terminalEvent?.reason || null,
    changedFiles: Array.isArray(metadata?.changeSet?.changedFiles) ? metadata.changeSet.changedFiles.slice(0, 500) : [],
    verification: { status: telemetry.verificationStatus || metadata.verificationStatus || null },
    delegation: {
      mode: delegation.mode || "bounded",
      maxSubagents: Number.isInteger(delegation.maxSubagents) ? delegation.maxSubagents : 20,
      childAgentsObserved: telemetry.childAgentsObserved ?? 0,
      anonymousAgentEventsObserved: telemetry.anonymousAgentEventsObserved ?? 0
    },
    usage: {
      inputTokens: telemetry.tokenInput ?? null,
      outputTokens: telemetry.tokenOutput ?? null,
      tokenSource: telemetry.tokenSource || "unavailable",
      costIncrementalBRL: 0
    },
    evidence: {
      resolutionState: resolution.outcome?.state || null,
      evidenceCount: Array.isArray(resolution.evidence?.selected) ? resolution.evidence.selected.length : null
    },
    privacy: "No prompt, provider output, secret, credential, or file contents are persisted in this receipt."
  };
}

function writeRunReceipt(input) {
  const value = buildRunReceipt(input);
  const filePath = receiptPath(input.workspacePath, input.run?.id);
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch {}
  return { filePath, receipt: value };
}

function readRunReceipt(workspacePath, runId) {
  try { return JSON.parse(fs.readFileSync(receiptPath(workspacePath, runId), "utf8")); } catch { return null; }
}

module.exports = { receiptDirectory, receiptPath, buildRunReceipt, writeRunReceipt, readRunReceipt };
