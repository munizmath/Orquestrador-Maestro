"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const bridge = path.resolve(__dirname, "../../../scripts/nexus-pue-execution.py");
const digest = (letter) => `sha256:${letter.repeat(64)}`;

function run(cmd, args, cwd, env = {}) {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", ...env } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function fixture(t, nexusBehavior = "verified") {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-nexus-unit-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const project = path.join(base, "project");
  const worktree = path.join(base, "worktree");
  const pue = path.join(base, "pue");
  const ci = path.join(pue, "policies", "ci");
  const pueSchema = path.join(pue, "schemas", "project.schema.json");
  fs.mkdirSync(path.join(project, "policy"), { recursive: true });
  fs.mkdirSync(path.join(project, "governance"), { recursive: true });
  fs.mkdirSync(path.join(project, "src"), { recursive: true });
  fs.mkdirSync(ci, { recursive: true });
  fs.mkdirSync(path.dirname(pueSchema), { recursive: true });
  fs.writeFileSync(path.join(project, "policy", "pue-policy.yaml"), "fixture: true\n");
  fs.writeFileSync(pueSchema, JSON.stringify({ properties: { git: { properties: { worktrees: { enum: ["allowed", "forbidden"] } } } } }));
  fs.writeFileSync(path.join(project, "governance", "project.yaml"), "git:\n  worktrees: allowed\n");
  fs.writeFileSync(path.join(project, "src", "file.js"), "old\n");
  run("git", ["init", "-q"], project);
  run("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "add", "."], project);
  run("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture"], project);
  const sha = run("git", ["rev-parse", "HEAD"], project);
  run("git", ["worktree", "add", "-q", "--detach", worktree], project);

  const envelope = { schema_version: 4, execution_id: "CHANGE-1", envelope_digest: digest("a"),
    scope: { allowed: ["src/**"] }, request: { track_id: "TRACK-1", capabilities: ["write"] },
    authorization: { type: "track", artifact: "mandate.json", authorization_id: "MANDATE-1", authorization_digest: digest("b") },
    spec: { digest: digest("c") }, policy: { digest: digest("d") }, baseline: { git_sha: sha } };
  const decision = { status: "AUTHORIZED", change_id: "CHANGE-1", envelope };
  const graph = { execution_id: "CHANGE-1", nodes: { "UNIT-1": {
    task_id: "UNIT-1", state: "READY", scope: [{ path: "src/file.js", intent: "write" }], declared_capabilities: ["write"]
  } } };
  const mandate = { authorization_id: "MANDATE-1", authorization_digest: digest("b"),
    track: { id: "TRACK-1" }, mandate: { scope: { allowed: ["src/**"], forbidden: ["src/secret/**"] } } };
  fs.writeFileSync(path.join(project, "decision.json"), JSON.stringify(decision));
  fs.writeFileSync(path.join(project, "graph.json"), JSON.stringify(graph));
  fs.writeFileSync(path.join(project, "mandate.json"), JSON.stringify(mandate));

  fs.writeFileSync(path.join(ci, "pue-preflight.py"), [
    "import json", "class EEV:",
    "    def verify_envelope(self, envelope, root): return {'effective_status': 'AUTHORIZED'}",
    "    def compute_envelope_digest(self, envelope): return envelope['envelope_digest']",
    "    def resolve_repo_artifact(self, root, reference): return root / reference",
    "eev = EEV()", "class TAV:",
    "    def load_authorization(self, path): return json.loads(path.read_text())",
    "    def path_is_covered(self, path, patterns):",
    "        return any(path == x.removesuffix('/**') or path.startswith(x.removesuffix('/**') + '/') for x in patterns)",
    "tav = TAV()", "def decide(*, execution_id, created_by, root):",
    "    return json.loads((root / 'decision.json').read_text())",
    "def write_envelope(envelope, root):",
    "    target = root / 'DEV/GOVERNANCE/EXECUTION.json'", "    target.parent.mkdir(parents=True, exist_ok=True)",
    "    target.write_text(json.dumps(envelope))", "    return target"
  ].join("\n"));
  fs.writeFileSync(path.join(ci, "pue-work-graph.py"), [
    "import json", "class WorkGraphError(Exception): pass",
    "def read_graph(root, execution_id): return json.loads((root / 'graph.json').read_text())",
    "def transition(root, execution_id, task_id, to_state, **kwargs):",
    "    graph = read_graph(root, execution_id)", "    graph['nodes'][task_id]['state'] = to_state",
    "    (root / 'graph.json').write_text(json.dumps(graph))", "    return graph['nodes'][task_id]"
  ].join("\n"));
  fs.writeFileSync(path.join(ci, "pue-execution-journal.py"), [
    "import json", "def append_event(root, execution_id, **event):",
    "    target = root / 'journal.json'", "    old = json.loads(target.read_text()) if target.exists() else []",
    "    value = {'event_id': 'event-' + str(len(old) + 1), 'type': event.get('type_'), **event}",
    "    old.append(value)", "    target.write_text(json.dumps(old))", "    return value",
    "def read_events(root, execution_id):",
    "    class Result: pass", "    result = Result()",
    "    result.events = json.loads((root / 'journal.json').read_text())",
    "    return result"
  ].join("\n"));
  fs.writeFileSync(path.join(ci, "pue-lease.py"), [
    "class Result:", "    def __init__(self, state): self.state = state",
    "def acquire(root): return Result('ACQUIRED')",
    "def assert_held(root): return Result('HELD')",
    "def release(root): return Result('RELEASED')",
    "def _run_backend(args, root):", "    class Proc: returncode = 0", "    return Proc()"
  ].join("\n"));
  fs.writeFileSync(path.join(ci, "pue-gate.py"), [
    "def run_gates(root):",
    `    return {'final': ${JSON.stringify(nexusBehavior === "gate-blocked" ? "BLOCKED" : "PASS")}, 'change_set_digest': 'sha256:' + 'e' * 64, 'worktree_digest': 'sha256:' + 'f' * 64}`
  ].join("\n"));

  const nexus = path.join(base, "fake-nexus.py");
  fs.writeFileSync(nexus, `#!/usr/bin/env python3
import json, pathlib, subprocess, sys
root = pathlib.Path(${JSON.stringify(project)})
worktree = pathlib.Path(${JSON.stringify(worktree)})
if sys.argv[1] != 'maestro-unit': raise SystemExit(2)
operation = sys.argv[2]
record = root / 'request-record.json'
if operation != 'dispatch':
    request = json.loads(record.read_text())
    identity = {key: request[key] for key in ('idempotency_key', 'project_id', 'change_id', 'execution_id', 'task_id', 'track_id', 'envelope_digest', 'authorization_digest')}
    final_record = root / 'unit-final.json'
    unit = json.loads(final_record.read_text()) if final_record.exists() else dict(identity,
        status='UNKNOWN_EXTERNAL_OUTCOME', intervention_required=True, plan_id='plan-1',
        plan_revision=1, run_id='run-1', workspace=str(worktree))
    if operation == 'cancel':
        unit['status'] = 'CANCEL_REQUESTED'
        print(json.dumps({'event': 'cancel_requested', 'unit': unit}), flush=True)
    elif operation == 'status':
        print(json.dumps({'event': 'status', 'unit': unit}), flush=True)
    elif operation == 'release':
        if ${JSON.stringify(nexusBehavior)} == 'release-fail' and not (root / 'release-allowed').exists():
            raise SystemExit(1)
        if worktree.exists():
            subprocess.run(['git', '-C', str(root), 'worktree', 'remove', '--force', str(worktree)], check=True)
        print(json.dumps({'event': 'released', 'unit': unit}), flush=True)
    else: raise SystemExit(2)
    raise SystemExit(0)
request = json.loads(pathlib.Path(sys.argv[sys.argv.index('--request') + 1]).read_text())
record.write_text(json.dumps(request))
count = root / 'dispatch-count'
count.write_text(str(int(count.read_text()) + 1) if count.exists() else '1')
identity = {key: request[key] for key in ('idempotency_key', 'project_id', 'change_id', 'execution_id', 'task_id', 'track_id', 'envelope_digest', 'authorization_digest')}
unit = dict(identity, status='EXECUTING', plan_id='plan-1', plan_revision=1, run_id='run-1', workspace=str(worktree))
print(json.dumps({'event': 'accepted', 'unit': unit}), flush=True)
if ${JSON.stringify(nexusBehavior)} == 'unknown': raise SystemExit(1)
(worktree / 'src/file.js').write_text('new\\n')
if ${JSON.stringify(nexusBehavior)} == 'outside':
    (worktree / 'src/secret.js').write_text('outside\\n')
unit['status'] = 'COMPLETED_VERIFIED'
unit['evidence'] = dict(receipt_id='receipt-1', receipt_digest='sha256:' + 'f' * 64, status='VERIFIED',
    base_revision=${JSON.stringify(sha)}, result_revision=${JSON.stringify(sha)}, changed_files=['src/file.js'] + (['src/secret.js'] if ${JSON.stringify(nexusBehavior)} == 'outside' else []),
    command_digests=[], tests=[])
(root / 'unit-final.json').write_text(json.dumps(unit))
print(json.dumps({'event': 'final', 'unit': unit}), flush=True)
`);
  fs.chmodSync(nexus, 0o700);
  const execute = (operation = "dispatch") => {
    const result = spawnSync("python3", [bridge, operation, "--project-root", project, "--pue-root", pue,
      "--execution-id", "CHANGE-1", "--task-id", "UNIT-1", "--nexus-project-id", "project-1",
      "--nexus-executable", nexus, "--provider", "codex"], {
      cwd: project, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { project, worktree, graph, decision, execute };
}

test("simulated Nexus unit reaches COMPLETED only after PUE gate and records evidence", (t) => {
  const fx = fixture(t);
  assert.equal(fx.execute().status, "COMPLETED");
  assert.equal(fs.readFileSync(path.join(fx.project, "src/file.js"), "utf8"), "new\n");
  assert.equal(JSON.parse(fs.readFileSync(path.join(fx.project, "graph.json"))).nodes["UNIT-1"].state, "COMPLETED");
  const events = JSON.parse(fs.readFileSync(path.join(fx.project, "journal.json")));
  assert.ok(events.some((event) => event.type_ === "WORK_AUTHORIZED"));
  assert.ok(events.some((event) => event.type_ === "FILE_CHANGED" && event.payload.path === "src/file.js"));
  assert.ok(events.some((event) => event.type_ === "GATE_PASSED"));
  assert.equal(fx.execute().reasonCode, "PUE_UNIT_NOT_READY");
  assert.equal(fs.readFileSync(path.join(fx.project, "dispatch-count"), "utf8"), "1");
  assert.equal(fs.existsSync(fx.worktree), false);
});

test("PUE rejection and unknown Nexus outcome never cause a second dispatch", (t) => {
  const fx = fixture(t, "unknown");
  fx.decision.status = "BLOCKED_DECISION";
  fs.writeFileSync(path.join(fx.project, "decision.json"), JSON.stringify(fx.decision));
  assert.equal(fx.execute().status, "BLOCKED_DECISION");
  assert.equal(fs.existsSync(path.join(fx.project, "dispatch-count")), false);
  fx.decision.status = "AUTHORIZED";
  fs.writeFileSync(path.join(fx.project, "decision.json"), JSON.stringify(fx.decision));
  const first = fx.execute();
  assert.equal(first.status, "INTERVENTION_REQUIRED");
  assert.equal(first.reasonCode, "NEXUS_RESULT_UNKNOWN");
  assert.equal(fx.execute().reasonCode, "PUE_UNIT_NOT_READY");
  fs.mkdirSync(path.join(fx.project, "DEV", "SPECS"), { recursive: true });
  fs.writeFileSync(path.join(fx.project, "DEV", "SPECS", "ACTIVE.md"), "Edição operacional dentro do mandato.\n");
  assert.equal(fx.execute("status").status, "OBSERVED");
  assert.equal(fx.execute("recover").reasonCode, "NEXUS_EXTERNAL_OUTCOME_UNKNOWN");
  assert.equal(fx.execute("cancel").status, "CANCEL_REQUESTED");
  assert.equal(fs.readFileSync(path.join(fx.project, "dispatch-count"), "utf8"), "1");
  assert.equal(fs.existsSync(fx.worktree), true);
});

test("worktree prohibition blocks dispatch before PUE state changes", (t) => {
  const fx = fixture(t);
  const schema = path.join(path.dirname(fx.project), "pue", "schemas", "project.schema.json");
  fs.writeFileSync(schema, JSON.stringify({ properties: { git: { properties: { worktrees: { const: "forbidden" } } } } }));
  assert.deepEqual(fx.execute(), { status: "BLOCKED_POLICY", reasonCode: "PUE_WORKTREE_ISOLATION_FORBIDDEN" });
  fs.writeFileSync(schema, JSON.stringify({ properties: { git: { properties: { worktrees: { enum: ["allowed", "forbidden"] } } } } }));
  fs.writeFileSync(path.join(fx.project, "governance", "project.yaml"), "git:\n  worktrees: forbidden\n");
  assert.deepEqual(fx.execute(), { status: "BLOCKED_POLICY", reasonCode: "PUE_WORKTREE_ISOLATION_FORBIDDEN" });
  assert.equal(fs.existsSync(path.join(fx.project, "DEV", "GOVERNANCE", "EXECUTION.json")), false);
  assert.equal(fs.existsSync(path.join(fx.project, "journal.json")), false);
  assert.equal(fs.existsSync(path.join(fx.project, "dispatch-count")), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(fx.project, "graph.json"))).nodes["UNIT-1"].state, "READY");
});

test("accepted project decision superseding Envelopes blocks legacy dispatch without side effects", (t) => {
  const fx = fixture(t);
  const adr = path.join(fx.project, "docs", "architecture", "decisions", "ADR-0021-descontinuacao-envelope-de-execucao.md");
  fs.mkdirSync(path.dirname(adr), { recursive: true });
  fs.writeFileSync(adr, "# ADR-0021 — Descontinuação do Envelope\n\n**Status:** aceita.\n**Supersedes:** ADR-0020 para novas atividades.\n");
  assert.deepEqual(fx.execute(), { status: "BLOCKED_DECISION", reasonCode: "PUE_ENVELOPE_REGIME_SUPERSEDED" });
  assert.equal(fs.existsSync(path.join(fx.project, "DEV", "GOVERNANCE", "EXECUTION.json")), false);
  assert.equal(fs.existsSync(path.join(fx.project, "journal.json")), false);
  assert.equal(fs.existsSync(path.join(fx.project, "dispatch-count")), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(fx.project, "graph.json"))).nodes["UNIT-1"].state, "READY");
});

test("PUE gates and write scope still block Nexus verified results", (t) => {
  const blocked = fixture(t, "gate-blocked");
  assert.equal(blocked.execute().status, "PUE_GATES_BLOCKED");
  assert.equal(JSON.parse(fs.readFileSync(path.join(blocked.project, "graph.json"))).nodes["UNIT-1"].state, "VERIFYING");
  assert.equal(blocked.execute("recover").status, "PUE_GATES_BLOCKED");
  const outside = fixture(t, "outside");
  const result = outside.execute();
  assert.equal(result.status, "INTERVENTION_REQUIRED");
  assert.equal(result.reasonCode, "NEXUS_WORKSPACE_PROMOTION_BLOCKED");
  assert.equal(fs.readFileSync(path.join(outside.project, "src/file.js"), "utf8"), "old\n");
});

test("branch-backed Nexus workspace cannot be promoted into PUE", (t) => {
  const fx = fixture(t);
  run("git", ["switch", "-c", "unit-branch"], fx.worktree);
  const result = fx.execute();
  assert.equal(result.status, "INTERVENTION_REQUIRED");
  assert.equal(result.reasonCode, "NEXUS_WORKSPACE_PROMOTION_BLOCKED");
  assert.equal(fs.readFileSync(path.join(fx.project, "src/file.js"), "utf8"), "old\n");
});

test("cleanup failure is recoverable after PUE completion without redispatch", (t) => {
  const fx = fixture(t, "release-fail");
  const first = fx.execute();
  assert.equal(first.status, "COMPLETED_CLEANUP_PENDING");
  assert.equal(fs.existsSync(fx.worktree), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(fx.project, "graph.json"))).nodes["UNIT-1"].state, "COMPLETED");
  assert.equal(fx.execute("cleanup").status, "COMPLETED_CLEANUP_PENDING");
  fs.writeFileSync(path.join(fx.project, "release-allowed"), "yes\n");
  assert.equal(fx.execute("cleanup").status, "COMPLETED");
  assert.equal(fs.existsSync(fx.worktree), false);
  assert.equal(fs.readFileSync(path.join(fx.project, "dispatch-count"), "utf8"), "1");
});
