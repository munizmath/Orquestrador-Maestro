"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const { NexusAdapter, normalizeQuota, parseVersion } = require("..");
const { MaestroApplication, ProviderRegistry } = require("../../application/maestro-application");

function fakeSpawn(fixtures, calls, failures = {}) {
  return (_executable, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.kill = () => true;
    const command = args;
    const key = command.join(" ");
    calls.push(command);

    child.stdout.on("end", () => {
      if (failures[key]) {
        const error = Object.assign(new Error("simulated command failure"), { code: failures[key] });
        child.emit("error", error);
        return;
      }
      child.emit("close", Object.hasOwn(fixtures, key) ? 0 : 2, null);
    });
    queueMicrotask(() => child.stdout.end(Object.hasOwn(fixtures, key) ? JSON.stringify(fixtures[key]) : ""));
    return child;
  };
}

const observeFixtures = {
  "version --json": { version: "0.5.0-beta.23", commit: "fixture", os: "linux", arch: "amd64" },
  "providers --json": {
    codex: { name: "Codex", installed: true, version: "1.2.3", binary_path: "/private/path/codex", profiles: 1, capabilities: { usage: true, resume: true } },
    claude: { name: "Claude", installed: false, version: "", binary_path: "", profiles: 0, capabilities: { usage: false } }
  },
  "sessions --json": [
    { id: "session-1", title: "private conversation title", provider: "codex", profile: "work", workspace: "/private/project", last_modified: "2026-10-26T12:00:00Z" }
  ],
  "usage --json": [
    { provider_id: "codex", profile_id: "private-profile", status: "CACHED", source: "LOCAL_FILES", account: "private@example.test", plan: "private plan", windows: [{ kind: "five_hour", used_percent: 40, remaining_percent: 60, reset_time: "2026-10-26T16:00:00Z" }] },
    { provider_id: "claude", profile_id: "private-profile", status: "ESTIMATED", source: "OBSERVATION", windows: [] }
  ],
  "ps --json": [
    { runtime_id: "runtime-1", provider_id: "codex", profile_id: "work", state: "RUNNING", control_level: "SUPERVISED", workspace: "/private/project" }
  ]
};

test("Nexus is disabled by default and does not affect the existing provider registry", async () => {
  const calls = [];
  const nexus = new NexusAdapter({ mode: "disabled", spawnProcess: fakeSpawn(observeFixtures, calls) });
  assert.deepEqual(await nexus.detect(), {
    id: "nexus", installed: false, executionAvailable: false, enabled: false, mode: "disabled", error: "Nexus integration is disabled."
  });
  assert.deepEqual(calls, []);

  const previousMode = process.env.MAESTRO_NEXUS_MODE;
  delete process.env.MAESTRO_NEXUS_MODE;
  try {
    const registry = new ProviderRegistry();
    assert.ok(registry.get("codex"));
    assert.ok(registry.get("claude"));
    assert.ok(registry.get("opencode"));
    assert.ok(registry.get("nexus") instanceof NexusAdapter);
    assert.equal((await registry.get("nexus").detect()).mode, "disabled");
  } finally {
    if (previousMode === undefined) delete process.env.MAESTRO_NEXUS_MODE;
    else process.env.MAESTRO_NEXUS_MODE = previousMode;
  }
});

test("locally reviewed Nexus detection uses supported JSON contracts and reports execution as unsupported", async () => {
  const calls = [];
  const nexus = new NexusAdapter({ mode: "observe", spawnProcess: fakeSpawn(observeFixtures, calls) });
  const detected = await nexus.detect({ workspacePath: "/workspace/project" });

  assert.equal(detected.installed, true);
  assert.equal(detected.executionAvailable, false);
  assert.equal(detected.compatible, true);
  assert.equal(detected.version, "0.5.0-beta.23");
  assert.equal(detected.nexus.observation, "SUPPORTED");
  assert.equal(detected.nexus.providerHealth, "UNSUPPORTED");
  assert.equal(detected.nexus.execution, "UNSUPPORTED");
  assert.deepEqual(nexus.lastDetection.providers.map(({ id, installed, profiles }) => ({ id, installed, profiles })), [
    { id: "codex", installed: true, profiles: 1 },
    { id: "claude", installed: false, profiles: 0 }
  ]);
  assert.deepEqual(calls.map((args) => args.join(" ")).sort(), [
    "providers --json", "version --json"
  ]);
  assert.equal((await nexus.capabilities()).headless, false);
  assert.equal((await nexus.capabilities()).structuredEvents, false);
});

test("observation preserves quota certainty and omits private session text, paths, and account data", async () => {
  const calls = [];
  const nexus = new NexusAdapter({ mode: "observe", spawnProcess: fakeSpawn(observeFixtures, calls) });
  const app = new MaestroApplication({
    projectRoot: process.cwd(),
    governance: { mode: "compatibility" },
    providers: new ProviderRegistry([nexus])
  });
  const observation = await app.observeProvider("nexus", { workspacePath: process.cwd() });

  assert.equal(observation.state, "LIVE");
  assert.equal(observation.sessions.state, "LIVE");
  assert.equal(observation.sessions.total, 1);
  assert.deepEqual(observation.sessions.byProvider, { codex: 1 });
  assert.equal(observation.runtimes.activeCount, 1);
  assert.deepEqual(observation.quota.map(({ provider, state }) => ({ provider, state })), [
    { provider: "codex", state: "CACHED" },
    { provider: "claude", state: "ESTIMATED" }
  ]);
  assert.equal(observation.quotaState, "UNKNOWN");
  assert.deepEqual(observation.quota[0].windows, [{
    kind: "five_hour", group: null, usedPercent: 40, remainingPercent: 60, resetTime: "2026-10-26T16:00:00.000Z"
  }]);
  assert.deepEqual(observation.cost, { state: "UNKNOWN", amount: null, currency: null });
  const serialized = JSON.stringify(observation);
  for (const privateValue of ["private conversation title", "/private/project", "private@example.test", "private-profile", "private plan", "/private/path/codex"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.ok(calls.some((args) => args.join(" ") === "usage --json"));
  assert.ok(calls.every((args) => !args.includes("--refresh")));
  assert.ok(calls.every((args) => !["run", "start", "plan", "profiles"].includes(args[0])));
});

test("missing quota fields remain UNKNOWN and costs are never synthesized", () => {
  assert.deepEqual(normalizeQuota([{ provider_id: "codex", source: "not-a-known-freshness-value" }]), [{
    provider: "codex",
    state: "UNKNOWN",
    source: "not-a-known-freshness-value",
    health: "UNKNOWN",
    windows: null,
    cost: { state: "UNKNOWN", amount: null, currency: null }
  }]);
});

test("an empty quota result remains UNKNOWN rather than implying available or exhausted capacity", async () => {
  const fixtures = { ...observeFixtures, "usage --json": [] };
  const nexus = new NexusAdapter({ mode: "observe", spawnProcess: fakeSpawn(fixtures, []) });
  const observation = await nexus.observe();

  assert.deepEqual(observation.quota, []);
  assert.equal(observation.quotaState, "UNKNOWN");
  assert.deepEqual(observation.cost, { state: "UNKNOWN", amount: null, currency: null });
});

test("unreviewed Nexus versions are detected but never treated as compatible", async () => {
  const calls = [];
  const nexus = new NexusAdapter({
    mode: "observe",
    spawnProcess: fakeSpawn({ "version --json": { version: "1.0.0" } }, calls)
  });
  const result = await nexus.detect();

  assert.equal(result.installed, true);
  assert.equal(result.compatible, false);
  assert.equal(result.version, "1.0.0");
  assert.deepEqual(calls, [["version", "--json"]]);
  assert.deepEqual(parseVersion({ version: "v1.0.2" }), { raw: "v1.0.2", major: 1, minor: 0, patch: 2 });
  assert.equal(parseVersion({ version: "latest" }), null);
});

test("execute mode refuses dispatch because no PUE-safe CLI contract exists", async () => {
  const calls = [];
  const nexus = new NexusAdapter({ mode: "execute", spawnProcess: fakeSpawn(observeFixtures, calls) });

  const detection = await nexus.detect();
  assert.equal(detection.installed, null);
  assert.equal(detection.executionAvailable, false);
  await assert.rejects(nexus.execute({ prompt: "simulated work unit" }), { code: "NEXUS_EXECUTION_UNSUPPORTED" });
  assert.deepEqual(calls, []);
});

test("application rejects Nexus as an execution target while keeping it observable", async () => {
  const calls = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-nexus-observe-only-"));
  const nexus = new NexusAdapter({ mode: "observe", spawnProcess: fakeSpawn(observeFixtures, calls) });
  const app = new MaestroApplication({ projectRoot: root, providers: new ProviderRegistry([nexus]) });

  try {
    await assert.rejects(
      app.createRun({ providerId: "nexus", description: "simulated work unit" }),
      { code: "PROVIDER_EXECUTION_UNSUPPORTED" }
    );
    assert.deepEqual(calls.map((args) => args.join(" ")).sort(), ["providers --json", "version --json"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing Nexus installation remains a normal unavailable provider", async () => {
  const calls = [];
  const nexus = new NexusAdapter({ mode: "observe", spawnProcess: fakeSpawn({}, calls, { "version --json": "ENOENT" }) });
  const result = await nexus.detect();
  assert.equal(result.installed, false);
  assert.equal(result.enabled, true);
  assert.match(result.error, /not available/u);
});

