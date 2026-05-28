"use strict";

const { createRun, updateRun } = require("./run-registry.js");
const { appendAuditEvent } = require("./audit-log.js");
const { dryRunConnector } = require("./connector-service.js");

const ALLOWED_TASKS = Object.freeze({
  "validate": {
    kind: "validation",
    command: "validate --check-sync",
  },
  "health": {
    kind: "health",
    command: "health local",
  },
  "webhook.emit": {
    kind: "adapter",
    command: "adapter webhook.emit",
    connectorId: "mock-webhook",
  },
  "n8n.workflow.trigger": {
    kind: "adapter",
    command: "adapter n8n.workflow.trigger",
    connectorId: "mock-n8n",
  },
  "message.send": {
    kind: "adapter",
    command: "adapter message.send",
    connectorId: "mock-message-channel",
  },
  "llm.complete": {
    kind: "adapter",
    command: "adapter llm.complete",
    connectorId: "live-llm",
  },
});

function taskPath(taskId) {
  return `queue/${taskId}.json`;
}

function newTaskId() {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function enqueueTask(store, input = {}) {
  if (!ALLOWED_TASKS[input.type]) {
    throw new Error(`Task type not allowed: ${input.type}`);
  }
  const now = new Date().toISOString();
  const task = {
    schemaVersion: 1,
    taskId: input.taskId || newTaskId(),
    type: input.type,
    kind: input.type,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    idempotencyKey: input.idempotencyKey || `${input.type}:${now.slice(0, 10)}`,
    command: ALLOWED_TASKS[input.type].command,
    adapterIntent: input.adapterIntent || null,
    dryRun: input.dryRun || null,
    runId: null,
    lastError: null,
  };
  store.writeJson(taskPath(task.taskId), task);
  appendAuditEvent(store, {
    type: "job.enqueued",
    source: "queue-service",
    status: "pending",
    safeSummary: `Queued ${task.kind}`,
    details: { taskId: task.taskId, kind: task.kind },
  });
  return task;
}

function listTasks(store) {
  return store.listJson("queue").map((file) => store.readJson(`queue/${require("node:path").basename(file)}`));
}

function getTask(store, taskId) {
  return store.readJson(taskPath(taskId), null);
}

function updateTask(store, task) {
  const next = { ...task, updatedAt: new Date().toISOString() };
  store.writeJson(taskPath(next.taskId), next);
  return next;
}

function runTask(store, taskId) {
  const task = getTask(store, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status !== "pending" && task.status !== "ready") {
    throw new Error(`Task is not runnable: ${task.status}`);
  }
  const started = new Date().toISOString();
  const definition = ALLOWED_TASKS[task.type || task.kind];
  if (definition && definition.kind === "adapter") {
    if (!task.dryRun || !task.idempotencyKey) {
      throw new Error("Adapter task requires saved dry-run and idempotency key.");
    }
    const connectorId = definition.connectorId;
    if (connectorId) dryRunConnector(connectorId, task.adapterIntent || {}, { confirmed: true, consent: true });
  }
  const run = createRun(store, {
    kind: task.kind,
    command: task.command,
    summary: `Queued task ${task.kind}`,
    startedAt: started,
  });
  updateTask(store, { ...task, status: "running", attempts: task.attempts + 1, runId: run.id });
  const completed = new Date().toISOString();
  updateRun(store, run.id, {
    status: "succeeded",
    completedAt: completed,
    durationMs: Math.max(0, Date.parse(completed) - Date.parse(started)),
    summary: `Task ${task.kind} completed`,
  });
  const finished = updateTask(store, { ...task, status: "succeeded", attempts: task.attempts + 1, runId: run.id });
  appendAuditEvent(store, {
    type: "job.succeeded",
    source: "queue-service",
    status: "succeeded",
    safeSummary: `Task ${task.kind} completed`,
    details: { taskId: task.taskId, runId: run.id },
  });
  return finished;
}

function cancelTask(store, taskId) {
  const task = getTask(store, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  const cancelled = updateTask(store, { ...task, status: "cancelled" });
  appendAuditEvent(store, {
    type: "job.cancelled",
    source: "queue-service",
    status: "cancelled",
    safeSummary: `Task ${task.kind} cancelled`,
    details: { taskId },
  });
  return cancelled;
}

module.exports = {
  ALLOWED_TASKS,
  cancelTask,
  enqueueTask,
  getTask,
  listTasks,
  runTask,
};
