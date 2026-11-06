"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const { JsonFileRunStore } = require("../../store");
const { makeTempDir } = require("../../../tests/test-helpers");
const { AutopilotMissionController } = require("..");

function fixture() {
  const root = makeTempDir("autopilot-mission-");
  const leaseFile = path.join(root, "maestro", "runtime", "runs.json");
  const make = (controllerId) => new AutopilotMissionController({
    projectRoot: root,
    controllerId,
    leaseStore: new JsonFileRunStore({ filePath: leaseFile }),
    leaseTtlMs: 30_000
  });
  return { root, make };
}

test("Autopilot creates exactly five recoverable mission artifacts", async () => {
  const { root, make } = fixture();
  const controller = make("controller-a");
  const started = await controller.start({ objective: "Construir uma API verificável" });
  assert.equal(started.status, "running");
  const files = (await fs.readdir(path.join(root, ".omx", "autopilot"))).sort();
  assert.deepEqual(files, ["boundaries.md", "checkpoint.md", "survival-guide.md", "tasks.md", "validation.md"]);
  const checkpoint = await fs.readFile(path.join(root, ".omx", "autopilot", "checkpoint.md"), "utf8");
  assert.match(checkpoint, /"status": "running"/u);
  assert.match(checkpoint, /"controller_lease_epoch": 1/u);
});

test("controller fencing prevents a second controller and rejects the stale epoch", async () => {
  const { make } = fixture();
  const first = make("controller-a");
  const second = make("controller-b");
  await first.start({ objective: "Missão com controle único" });
  await assert.rejects(() => second.resume(), (error) => error.code === "LEASE_UNAVAILABLE");
  const staleLease = first.lease;
  await first.release();
  const resumed = await second.resume();
  assert.equal(resumed.controllerLease.epoch, 2);
  const store = second.leaseStore;
  await assert.rejects(() => store.withLease(staleLease, async () => undefined), (error) => error.code === "STALE_LEASE");
});

test("a failed task invokes the council while independent work continues", async () => {
  const { make } = fixture();
  const controller = make("controller-c");
  controller.council = {
    async consult() {
      return {
        output: "REMEDIATION_PLAN",
        rationale: "A correção precisa ser executada antes da nova verificação.",
        evidence_refs: ["EVIDENCE-1"],
        tasks: [{ task_id: "TASK-REMEDIATION", description: "Aplicar a remediação autorizada", lane_id: "LANE-RECOVERY" }]
      };
    }
  };
  await controller.start({ objective: "Missão com recuperação" });
  await controller.addTasks([
    { task_id: "TASK-BLOCKED", lane_id: "LANE-A", description: "Integrar o fornecedor" },
    { task_id: "TASK-INDEPENDENT", lane_id: "LANE-B", description: "Atualizar a documentação" }
  ]);
  const status = await controller.status();
  const result = await controller.ingestEvent({
    event_id: "EVENT-1",
    source: "test-adapter",
    event_type: "execution.failed",
    project_id: status.projectId,
    run_id: status.runId,
    task_id: "TASK-BLOCKED",
    attempt_id: "ATTEMPT-1",
    reason: "technical_failure"
  });
  assert.equal(result.council.output, "REMEDIATION_PLAN");
  const files = await controller.artifacts.readAll();
  assert.equal(files.checkpoint.status, "running");
  assert.equal(files.tasks.tasks.find((task) => task.task_id === "TASK-BLOCKED").status, "waiting");
  assert.equal(files.tasks.tasks.find((task) => task.task_id === "TASK-INDEPENDENT").status, "queued");
  assert.equal(files.tasks.tasks.find((task) => task.task_id === "TASK-REMEDIATION").status, "queued");
  assert.equal(files.validation.councils[0].output, "REMEDIATION_PLAN");
});

test("accepted risk requires a decision that expressly authorizes completion", async () => {
  const { make } = fixture();
  const controller = make("controller-d");
  await controller.start({ objective: "Missão com limitação explícita" });
  await controller.addTasks({ task_id: "TASK-1", description: "Executar a verificação" });
  await assert.rejects(() => controller.completeTask({ taskId: "TASK-1", technicalResult: "fail", disposition: "accepted_risk" }), /expressly authorizes completion/u);
  await controller.recordDecision({ decision_id: "DECISION-1", effect: "Entregar com a limitação documentada", authorizes_completion: true });
  await controller.completeTask({ taskId: "TASK-1", technicalResult: "fail", disposition: "accepted_risk", decisionRef: "DECISION-1", evidenceRef: "EVIDENCE-1" });
  const completed = await controller.completeMission();
  assert.equal(completed.status, "completed");
  const files = await controller.artifacts.readAll();
  assert.equal(files.validation.gates[0].technical_result, "fail");
  assert.equal(files.validation.gates[0].disposition, "accepted_risk");
});

test("completed execution event is retained for verification and is not task completion", async () => {
  const { make } = fixture();
  const controller = make("controller-e");
  await controller.start({ objective: "Missão com evento correlacionado" });
  await controller.addTasks({ task_id: "TASK-1", description: "Executar uma etapa" });
  const status = await controller.status();
  const first = await controller.ingestEvent({
    event_id: "EVENT-2",
    source: "adapter",
    event_type: "execution.completed",
    project_id: status.projectId,
    run_id: status.runId,
    task_id: "TASK-1",
    attempt_id: "ATTEMPT-2",
    result_ref: "RESULT-2",
    evidence_refs: ["EVIDENCE-2"]
  });
  const duplicate = await controller.ingestEvent({
    event_id: "EVENT-2",
    source: "adapter",
    event_type: "execution.completed",
    project_id: status.projectId,
    run_id: status.runId,
    task_id: "TASK-1",
    attempt_id: "ATTEMPT-2",
    result_ref: "RESULT-2"
  });
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  const files = await controller.artifacts.readAll();
  assert.equal(files.tasks.tasks[0].status, "queued");
  assert.deepEqual(files.tasks.tasks[0].result_refs, ["RESULT-2"]);
  assert.equal(files.checkpoint.next_action.type, "verify_task");
});
