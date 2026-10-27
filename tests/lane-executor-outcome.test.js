"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { LaneExecutor } = require("../runtime/planner/lane-executor");

for (const runStatus of ["failed", "cancelled", "timed_out", undefined]) {
  test(`lane executor blocks dependents when run status is ${runStatus || "missing"}`, async () => {
    const executed = [];
    const completed = [];
    const executor = new LaneExecutor({
      application: {
        getMission: async () => ({ projectId: "project-1" }),
        executeRun: async ({ semanticTaskId }) => {
          executed.push(semanticTaskId);
          return runStatus === undefined ? {} : { run: { status: runStatus } };
        }
      }
    });
    executor.on("task.completed", ({ id }) => completed.push(id));

    const results = await executor.execute([
      { id: "first", description: "First task", dependsOn: [] },
      { id: "second", description: "Dependent task", dependsOn: ["first"] }
    ], "mission-1");

    assert.deepEqual(executed, ["first"]);
    assert.deepEqual(completed, []);
    assert.equal(results.first.status, "failed");
    assert.match(results.first.error, /run finished with status:/);
    assert.equal(results.second.status, "failed");
    assert.match(results.second.error, /blocked by failed dependency: first/);
  });
}

test("lane executor advances dependents after a completed run", async () => {
  const executed = [];
  const executor = new LaneExecutor({
    application: {
      getMission: async () => ({ projectId: "project-1" }),
      executeRun: async ({ semanticTaskId }) => {
        executed.push(semanticTaskId);
        return { run: { status: "completed" } };
      }
    }
  });

  const results = await executor.execute([
    { id: "first", description: "First task", dependsOn: [] },
    { id: "second", description: "Dependent task", dependsOn: ["first"] }
  ], "mission-1");

  assert.deepEqual(executed, ["first", "second"]);
  assert.equal(results.first.status, "completed");
  assert.equal(results.second.status, "completed");
});
