"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ElasticScheduler } = require("..");

test("ElasticScheduler respects shared capacity and allows serial fallback", () => {
  const scheduler = new ElasticScheduler({ maxAgents: 4, pools: { opencode: 2 } });
  const first = scheduler.requestCapacity({ projectId: "project-a", readyLanes: 4, minAgents: 1, preferredAgents: 4, maxAgents: 4, poolIds: ["opencode"] });
  assert.equal(first.status, "granted");
  assert.equal(first.agentCount, 2);
  const second = scheduler.requestCapacity({ projectId: "project-b", readyLanes: 2, minAgents: 2, preferredAgents: 2, maxAgents: 2, allowSerialFallback: false, poolIds: ["opencode"] });
  assert.equal(second.status, "waiting");
  assert.equal(second.reason, "capacity_unavailable");
  scheduler.releaseCapacity(first.allocationId);
  const third = scheduler.requestCapacity({ projectId: "project-b", readyLanes: 2, minAgents: 2, preferredAgents: 2, maxAgents: 2, poolIds: ["opencode"] });
  assert.equal(third.status, "granted");
  assert.equal(third.agentCount, 2);
});

test("ElasticScheduler shares free capacity before expanding one project", () => {
  const scheduler = new ElasticScheduler({ maxAgents: 4 });
  const first = scheduler.requestCapacity({ projectId: "project-a", readyLanes: 1, preferredAgents: 1, maxAgents: 1 });
  assert.equal(first.agentCount, 1);
  const second = scheduler.requestCapacity({ projectId: "project-b", readyLanes: 4, preferredAgents: 4, maxAgents: 4 });
  assert.equal(second.agentCount, 2);
  assert.equal(scheduler.snapshot().usedAgents, 3);
});
