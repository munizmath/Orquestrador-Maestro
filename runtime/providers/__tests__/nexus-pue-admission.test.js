"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const script = path.resolve(__dirname, "../../../scripts/nexus-pue-admission.py");

test("Nexus PUE bridge accepts only a canonical READY unit within an authorized Envelope", (t) => {
  const python = spawnSync("python3", ["--version"], { encoding: "utf8" });
  if (python.error || python.status !== 0) return t.skip("Python 3 unavailable");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-nexus-pue-"));
  const project = path.join(root, "project");
  const pue = path.join(root, "pue");
  const modules = path.join(pue, "policies", "ci");
  fs.mkdirSync(path.join(project, "policy"), { recursive: true });
  fs.mkdirSync(modules, { recursive: true });
  fs.writeFileSync(path.join(project, "policy", "pue-policy.yaml"), "fixture: true\n");
  fs.writeFileSync(path.join(modules, "pue-preflight.py"), [
    "import json",
    "class EnvelopeVerifier:",
    "    def verify_envelope(self, envelope, root):",
    "        return {'effective_status': 'AUTHORIZED'}",
    "    def resolve_repo_artifact(self, root, reference):",
    "        return root / reference",
    "eev = EnvelopeVerifier()",
    "class MandateVerifier:",
    "    def load_authorization(self, path):",
    "        return json.loads(path.read_text(encoding='utf-8'))",
    "    def path_is_covered(self, path, patterns):",
    "        return any(path == pattern.removesuffix('/**') or path.startswith(pattern.removesuffix('/**') + '/') for pattern in patterns)",
    "tav = MandateVerifier()",
    "def decide(*, execution_id, created_by, root):",
    "    return json.loads((root / 'decision.json').read_text(encoding='utf-8'))"
  ].join("\n"));
  fs.writeFileSync(path.join(modules, "pue-work-graph.py"), [
    "import json",
    "class WorkGraphError(Exception):",
    "    pass",
    "def read_graph(root, execution_id):",
    "    return json.loads((root / 'graph.json').read_text(encoding='utf-8'))"
  ].join("\n"));

  const digest = (letter) => `sha256:${letter.repeat(64)}`;
  const envelope = { schema_version: 4, execution_id: "CHANGE-1", envelope_digest: digest("a"),
    scope: { allowed: ["src/**"] }, request: { track_id: "TRACK-1", capabilities: ["read"] },
    authorization: { type: "track", artifact: "mandate.json", authorization_id: "MANDATE-1", authorization_digest: digest("b") },
    spec: { digest: digest("c") }, policy: { digest: digest("d") }, baseline: { git_sha: "e".repeat(40) } };
  const mandate = { authorization_id: "MANDATE-1", authorization_digest: digest("b"),
    track: { id: "TRACK-1" }, mandate: { scope: { allowed: ["src/**"], forbidden: ["src/secrets/**"] } } };
  const decision = { status: "AUTHORIZED", change_id: "CHANGE-1", envelope };
  const node = { task_id: "UNIT-1", state: "READY", scope: [{ path: "src/file.js", intent: "read" }], declared_capabilities: ["read"] };
  const graph = { execution_id: "CHANGE-1", nodes: { "UNIT-1": node } };
  const write = () => {
    fs.writeFileSync(path.join(project, "decision.json"), JSON.stringify(decision));
    fs.writeFileSync(path.join(project, "graph.json"), JSON.stringify(graph));
    fs.writeFileSync(path.join(project, "mandate.json"), JSON.stringify(mandate));
  };
  const check = () => {
    write();
    const result = spawnSync("python3", [script, "--project-root", project, "--pue-root", pue,
      "--execution-id", "CHANGE-1", "--task-id", "UNIT-1"], {
      encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };

  try {
    assert.deepEqual(check(), {
      status: "READY", changeId: "CHANGE-1", executionId: "CHANGE-1", taskId: "UNIT-1",
      envelopeDigest: digest("a"), authorizationId: "MANDATE-1", authorizationDigest: digest("b"),
      trackId: "TRACK-1", specDigest: digest("c"), policyDigest: digest("d"), baselineGitSha: "e".repeat(40),
      unitState: "READY", envelopeState: "AUTHORIZED", dispatch: "UNSUPPORTED"
    });
    decision.change_id = "OTHER-CHANGE";
    assert.deepEqual(check(), { status: "BLOCKED_POLICY", reasonCode: "PUE_EXECUTION_MISMATCH" });
    decision.change_id = "CHANGE-1";
    envelope.spec.digest = "invalid";
    assert.deepEqual(check(), { status: "BLOCKED_POLICY", reasonCode: "PUE_IDENTITY_INCOMPLETE" });
    envelope.spec.digest = digest("c");
    mandate.authorization_digest = digest("f");
    assert.deepEqual(check(), { status: "BLOCKED_POLICY", reasonCode: "PUE_MANDATE_MISMATCH" });
    mandate.authorization_digest = digest("b");
    node.scope = [{ path: "src/secrets/private.js", intent: "read" }];
    assert.deepEqual(check(), { status: "BLOCKED_DECISION", reasonCode: "PUE_UNIT_OUTSIDE_SCOPE" });
    for (const pathValue of ["src//secrets/private.js", "src/./secrets/private.js", "src/../secrets/private.js", "C:/src/file.js"]) {
      node.scope = [{ path: pathValue, intent: "read" }];
      assert.deepEqual(check(), { status: "BLOCKED_DECISION", reasonCode: "PUE_UNIT_OUTSIDE_SCOPE" });
    }
    node.scope = [{ path: "outside/file.js", intent: "write" }];
    assert.deepEqual(check(), { status: "BLOCKED_DECISION", reasonCode: "PUE_UNIT_OUTSIDE_SCOPE" });
    node.scope = [{ path: "src/file.js", intent: "read" }];
    node.declared_capabilities = ["deploy"];
    assert.deepEqual(check(), { status: "BLOCKED_DECISION", reasonCode: "PUE_UNIT_OUTSIDE_CAPABILITIES" });
    node.declared_capabilities = ["read"];
    node.state = "CLAIMED";
    assert.deepEqual(check(), { status: "BLOCKED_DECISION", reasonCode: "PUE_UNIT_NOT_READY" });
    node.state = "READY";
    envelope.schema_version = 3;
    assert.deepEqual(check(), { status: "BLOCKED_DECISION", reasonCode: "PUE_TRACK_MANDATE_REQUIRED" });
    envelope.schema_version = 4;
    decision.status = "BLOCKED_DECISION";
    assert.deepEqual(check(), { status: "BLOCKED_DECISION", reasonCode: "PUE_PREFLIGHT_REJECTED" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
