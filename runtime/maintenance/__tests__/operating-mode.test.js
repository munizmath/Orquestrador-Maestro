"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { buildPreflight } = require("../preflight");
const { buildContextPack } = require("../context-pack");
const { cleanupWorkspace } = require("../cleanup");
const { recordProviderHealth, listProviderHealth } = require("../../providers/provider-health");
const { buildRunReceipt, writeRunReceipt, readRunReceipt } = require("../../receipts/run-receipt");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-operating-mode-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), "export const answer = 42;\n");
  fs.writeFileSync(path.join(root, ".env.local"), "TOKEN=do-not-read\n");
  return root;
}

test("context pack omits sensitive files and only includes content explicitly requested", () => {
  const root = fixture();
  const manifest = buildContextPack({ workspacePath: root });
  assert.equal(manifest.files.some((file) => file.path === "src/app.js"), true);
  assert.equal(manifest.files.some((file) => file.path === ".env.local"), false);
  assert.equal(manifest.files.find((file) => file.path === "src/app.js").content, undefined);
  const withContent = buildContextPack({ workspacePath: root, includeContent: true });
  assert.match(withContent.files.find((file) => file.path === "src/app.js").content, /answer/);
});

test("preflight explains sensitive workspace blocking without exposing file contents", () => {
  const root = fixture();
  const result = buildPreflight({ workspacePath: root, providers: ["claude"] });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.failures.includes("sensitive-workspace-entry"), true);
  assert.equal(result.workspace.forbiddenEntries[0].path, ".env.local");
});

test("provider health is bounded and freshness is explicit", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-health-"));
  const filePath = path.join(root, "health.json");
  recordProviderHealth("opencode", { state: "READY", installed: true, executionAvailable: true }, { filePath });
  const rows = listProviderHealth({ filePath, maxAgeMs: 60_000 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].providerId, "opencode");
  assert.equal(rows[0].stale, false);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
});

test("cleanup only removes stale Maestro-owned temporary files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-cleanup-"));
  const temp = path.join(root, ".orquestrador-maestro", "tmp");
  const receipts = path.join(root, ".orquestrador-maestro", "receipts");
  fs.mkdirSync(temp, { recursive: true });
  fs.mkdirSync(receipts, { recursive: true });
  const oldFile = path.join(temp, "owned.tmp");
  const receipt = path.join(receipts, "keep.json");
  fs.writeFileSync(oldFile, "owned");
  fs.writeFileSync(receipt, "keep");
  const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldFile, old, old);
  const result = cleanupWorkspace({ workspacePath: root, maxAgeMs: 24 * 60 * 60 * 1000, apply: true });
  assert.deepEqual(result.removed, [".orquestrador-maestro/tmp/owned.tmp"]);
  assert.equal(fs.existsSync(receipt), true);
});

test("run receipt persists hashes and operational evidence, never prompt text", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-receipt-"));
  const run = { id: "run-test", taskId: "task-test", providerId: "opencode", status: "completed", createdAt: "2026-11-05T00:00:00Z", metadata: { cognitiveTelemetry: { tokenInput: 10, tokenOutput: 20, verificationStatus: "passed" }, changeSet: { changedFiles: ["src/app.js"] } } };
  const task = { id: "task-test", projectId: "project-test", description: "senha secreta não deve persistir" };
  const built = buildRunReceipt({ run, task, workspacePath: root });
  assert.equal(built.intentSha256.length, 64);
  assert.equal(JSON.stringify(built).includes("senha secreta"), false);
  const written = writeRunReceipt({ run, task, workspacePath: root });
  assert.deepEqual(readRunReceipt(root, run.id), written.receipt);
  assert.equal(fs.statSync(written.filePath).mode & 0o777, 0o600);
});
