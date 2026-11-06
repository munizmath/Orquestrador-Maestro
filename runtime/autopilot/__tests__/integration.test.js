"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { JsonFileRunStore } = require("../../store");
const { makeTempDir } = require("../../../tests/test-helpers");
const { AutopilotMissionController, MissionSupervisor, ProviderCouncilAdapter, SharedElasticScheduler } = require("..");

function storeFixture() {
  return new JsonFileRunStore({ filePath: path.join(makeTempDir("autopilot-integration-"), "runtime", "runs.json") });
}

test("shared scheduler enforces capacity across independent controller processes", async () => {
  const firstStore = storeFixture();
  const secondStore = new JsonFileRunStore({ filePath: firstStore.filePath });
  const first = new SharedElasticScheduler({ store: firstStore, maxAgents: 2 });
  const second = new SharedElasticScheduler({ store: secondStore, maxAgents: 2 });
  const firstAllocation = await first.requestCapacity({ projectId: "project-a", readyLanes: 2, minAgents: 1, preferredAgents: 2, maxAgents: 2 });
  const blocked = await second.requestCapacity({ projectId: "project-b", readyLanes: 1, minAgents: 1, preferredAgents: 1, maxAgents: 1, allowSerialFallback: false });
  assert.equal(firstAllocation.status, "granted");
  assert.equal(blocked.status, "waiting");
  await first.releaseCapacity(firstAllocation.allocationId);
  assert.equal((await second.requestCapacity({ projectId: "project-b", readyLanes: 1, minAgents: 1, preferredAgents: 1, maxAgents: 1 })).status, "granted");
});

test("persistent supervisor rechecks a council condition and resumes the affected blocker", async () => {
  const store = storeFixture();
  let available = false;
  let consultations = 0;
  const council = {
    async isAvailable() { return available; },
    async consult() {
      consultations += 1;
      return consultations === 1
        ? { output: "WAITING_CONDITION", condition: "council_route_available", watch_ref: "autopilot-council" }
        : { output: "RESOLVED", evidence_refs: ["EVIDENCE-COUNCIL-1"], rationale: "The corrected route confirms the cause." };
    }
  };
  const supervisor = new MissionSupervisor({ store, council });
  const controller = new AutopilotMissionController({ projectRoot: makeTempDir("autopilot-supervised-"), controllerId: "controller-supervised", leaseStore: store, council, supervisor });
  await controller.start({ objective: "Recuperar uma lane supervisionada" });
  await controller.addTasks({ task_id: "TASK-BLOCKED", description: "Executar a integração" });
  const status = await controller.status();
  await controller.ingestEvent({ event_id: "EVENT-FAIL", source: "test", event_type: "execution.failed", project_id: status.projectId, run_id: status.runId, task_id: "TASK-BLOCKED", reason: "technical_failure" });
  assert.equal((await supervisor.list({ status: "active" })).length, 1);
  await controller.release();
  available = true;
  const tick = await supervisor.tick();
  assert.deepEqual(tick.errors, []);
  assert.equal(tick.resolved.length, 1);
  const files = await controller.artifacts.readAll();
  assert.equal(files.tasks.tasks[0].status, "queued");
  assert.equal(files.tasks.blockers[0].status, "resolved");
});

test("persistent supervisor dispatches a resumed lane through the configured execution adapter", async () => {
  const store = storeFixture();
  const projectRoot = makeTempDir("autopilot-supervised-dispatch-");
  const supervisor = new MissionSupervisor({
    store,
    council: {
      async isAvailable() { return true; },
      async consult() { return { output: "RESOLVED", evidence_refs: ["EVIDENCE-COUNCIL-RESUME"] }; }
    },
    executionAdapter: {
      id: "test:executor",
      async startTask({ task }) {
        return { run: { status: "completed", id: `RUN-${task.task_id}` }, evidence: [{ id: `EVIDENCE-${task.task_id}` }] };
      }
    }
  });
  const controller = new AutopilotMissionController({ projectRoot, controllerId: "controller-dispatch", leaseStore: store, supervisor });
  await controller.start({ objective: "Retomar e despachar uma lane" });
  await controller.addTasks({ task_id: "TASK-RESUME", description: "Executar lane retomada" });
  const status = await controller.status();
  await controller.ingestEvent({ event_id: "EVENT-FAIL-2", source: "test", event_type: "execution.failed", project_id: status.projectId, run_id: status.runId, task_id: "TASK-RESUME", reason: "technical_failure" });
  await controller.release();
  const tick = await supervisor.tick();
  assert.deepEqual(tick.errors, []);
  const files = await controller.artifacts.readAll();
  assert.equal(files.tasks.tasks[0].status, "running");
  assert.equal(files.tasks.tasks[0].verification_refs[0], "EVIDENCE-TASK-RESUME");
});

test("provider council adapter invokes configured routes and aggregates incompatible advice", async () => {
  const calls = [];
  const adapters = new Map([
    ["opencode-a", {
      async detect() { return { installed: true }; },
      async execute(request) { calls.push(request); return { result: Promise.resolve({ stdout: JSON.stringify({ output: "REMEDIATION_PLAN", rationale: "A", tasks: [{ task_id: "TASK-R", description: "Remediar", owner: "executor", verification_refs: ["VERIFY-R"] }] }) }) }; }
    }],
    ["opencode-b", {
      async detect() { return { installed: true }; },
      async execute(request) { calls.push(request); return { result: Promise.resolve({ stdout: JSON.stringify({ output: "NEEDS_DECISION", rationale: "B", options: [{ id: "B" }] }) }) }; }
    }]
  ]);
  const adapter = new ProviderCouncilAdapter({
    application: { providers: { get(id) { return adapters.get(id); } } },
    routes: [{ providerId: "opencode-a" }, { providerId: "opencode-b" }],
    workspacePath: makeTempDir("autopilot-council-"),
    cloudContextApproved: true
  });
  const outcome = await adapter.consult({ task: { task_id: "TASK-1", description: "Diagnosticar", capabilities_required: ["backend"] }, blocker: { blocker_id: "BLOCK-1", reason: "failure" } });
  assert.equal(outcome.output, "NEEDS_DECISION");
  assert.equal(calls.length, 2);
  assert.match(calls[0].prompt, /TASK-1/u);
});
