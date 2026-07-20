"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createRun, updateRun } = require("./run-registry.js");
const { appendAuditEvent } = require("./audit-log.js");
const { dryRunConnector } = require("./connector-service.js");
const { validateProject } = require("./validation-service.js");
const { routePrompt } = require("./skill-service.js");

const DEFAULT_RETRY_POLICY = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
});

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
    connectorId: "local-webhook-dry-run",
  },
  "n8n.workflow.trigger": {
    kind: "adapter",
    command: "adapter n8n.workflow.trigger",
    connectorId: "local-n8n-dry-run",
  },
  "message.send": {
    kind: "adapter",
    command: "adapter message.send",
    connectorId: "local-message-dry-run",
  },
  "llm.complete": {
    kind: "adapter",
    command: "adapter llm.complete",
    connectorId: "live-llm",
  },
  "skill.route": {
    kind: "skill",
    command: "skills route",
  },
});

function taskPath(taskId) {
  return `queue/${taskId}.json`;
}

function deadLetterPath(taskId) {
  return `dead-letter/${taskId}.json`;
}

function newTaskId() {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function retryDelayMs(attempt, policy = DEFAULT_RETRY_POLICY) {
  const exponent = Math.max(0, Number(attempt || 1) - 1);
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * (2 ** exponent));
}

function normalizeRetryPolicy(input = {}) {
  return {
    maxAttempts: Number(input.maxAttempts || DEFAULT_RETRY_POLICY.maxAttempts),
    baseDelayMs: Number(input.baseDelayMs || DEFAULT_RETRY_POLICY.baseDelayMs),
    maxDelayMs: Number(input.maxDelayMs || DEFAULT_RETRY_POLICY.maxDelayMs),
  };
}

function isDue(task, now = Date.now()) {
  const availableAt = Date.parse(task.availableAt || task.nextRunAt || task.createdAt || new Date(0).toISOString());
  return Number.isNaN(availableAt) || availableAt <= now;
}

function enqueueTask(store, input = {}) {
  if (!ALLOWED_TASKS[input.type]) {
    throw new Error(`Task type not allowed: ${input.type}`);
  }
  const now = nowIso();
  const retryPolicy = normalizeRetryPolicy(input.retryPolicy || {});
  const task = {
    schemaVersion: 1,
    taskId: input.taskId || newTaskId(),
    type: input.type,
    kind: input.type,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    availableAt: input.availableAt || now,
    lockedAt: null,
    leaseExpiresAt: null,
    attempts: 0,
    maxAttempts: retryPolicy.maxAttempts,
    retryPolicy,
    idempotencyKey: input.idempotencyKey || `${input.type}:${now.slice(0, 10)}`,
    command: ALLOWED_TASKS[input.type].command,
    adapterIntent: input.adapterIntent || null,
    dryRun: input.dryRun || null,
    payload: input.payload || {},
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
  return store.listJson("queue")
    .map((file) => store.readJson(`queue/${path.basename(file)}`))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

function listDeadLetters(store) {
  return store.listJson("dead-letter")
    .map((file) => store.readJson(`dead-letter/${path.basename(file)}`))
    .sort((a, b) => String(a.deadLetteredAt || a.updatedAt || "").localeCompare(String(b.deadLetteredAt || b.updatedAt || "")));
}

function getTask(store, taskId) {
  return store.readJson(taskPath(taskId), null);
}

function updateTask(store, task) {
  const next = { ...task, updatedAt: nowIso() };
  store.writeJson(taskPath(next.taskId), next);
  return next;
}

function leaseNextTask(store, options = {}) {
  const now = options.nowMs || Date.now();
  const leaseMs = Number(options.leaseMs || 30000);
  const task = listTasks(store).find((item) =>
    ["pending", "ready", "retrying"].includes(item.status) && isDue(item, now)
  );
  if (!task) return null;
  const leasedAt = nowIso();
  return updateTask(store, {
    ...task,
    status: "running",
    attempts: Number(task.attempts || 0) + 1,
    lockedAt: leasedAt,
    leaseExpiresAt: new Date(Date.parse(leasedAt) + leaseMs).toISOString(),
    lastError: null,
  });
}

function executeTaskDefinition(store, task, definition, options = {}) {
  if (definition.kind === "adapter") {
    if (!task.dryRun || !task.idempotencyKey) {
      throw new Error("Adapter task requires saved dry-run and idempotency key.");
    }
    const connectorId = definition.connectorId;
    const result = connectorId
      ? dryRunConnector(connectorId, task.adapterIntent || {}, { confirmed: true, consent: true })
      : { ok: true };
    if (!result.ok) {
      throw new Error(result.code || "adapter_task_failed");
    }
    return { ok: true, summary: `Adapter task ${task.kind} completed`, issues: [] };
  }

  if (task.type === "validate") {
    const validation = validateProject(options.repoRoot || process.cwd(), {
      checkSync: task.payload && Object.prototype.hasOwnProperty.call(task.payload, "checkSync")
        ? Boolean(task.payload.checkSync)
        : true,
      includePackageCheck: Boolean(task.payload && task.payload.includePackageCheck),
    });
    return {
      ok: validation.ok,
      summary: validation.ok ? "Validation task passed" : "Validation task failed",
      issues: validation.issues || [],
      artifacts: [{ type: "validation", data: validation }],
    };
  }

  if (task.type === "health") {
    const repoRoot = options.repoRoot || process.cwd();
    const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "local-health.js"), "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
    });
    return {
      ok: result.status === 0,
      summary: result.status === 0 ? "Local health task passed" : "Local health task failed",
      issues: result.status === 0 ? [] : [{
        schemaVersion: 1,
        severity: "error",
        category: "health",
        code: "health_check_failed",
        message: result.stderr || result.stdout || (result.error && result.error.message) || "Local health failed",
      }],
    };
  }

  if (task.type === "skill.route") {
    const prompt = task.payload && (task.payload.prompt || task.payload.intent || task.payload.eventType);
    if (!prompt) {
      throw new Error("Skill route task requires payload.prompt, payload.intent, or payload.eventType.");
    }
    const routed = routePrompt(prompt, options.repoRoot || process.cwd(), Number(task.payload.top || 5));
    return {
      ok: true,
      summary: `Skill route resolved ${routed.skills.length} candidate skills`,
      issues: [],
      artifacts: [{ type: "skill-route", data: routed }],
    };
  }

  throw new Error(`Task handler not registered: ${task.type}`);
}

function finishTask(store, task, run, outcome) {
  const completed = nowIso();
  updateRun(store, run.id, {
    status: outcome.ok ? "succeeded" : "failed",
    completedAt: completed,
    durationMs: Math.max(0, Date.parse(completed) - Date.parse(run.startedAt)),
    summary: outcome.summary,
    issues: outcome.issues || [],
    artifacts: outcome.artifacts || [],
  });
  const finished = updateTask(store, {
    ...task,
    status: outcome.ok ? "succeeded" : "failed",
    runId: run.id,
    lockedAt: null,
    leaseExpiresAt: null,
    lastError: outcome.ok ? null : outcome.summary,
  });
  appendAuditEvent(store, {
    type: outcome.ok ? "job.succeeded" : "job.failed",
    source: "queue-service",
    status: finished.status,
    safeSummary: outcome.summary,
    details: { taskId: task.taskId, runId: run.id, attempts: finished.attempts },
  });
  return finished;
}

function retryOrFailTask(store, task, run, error) {
  const policy = normalizeRetryPolicy(task.retryPolicy || { maxAttempts: task.maxAttempts });
  const message = error && error.message ? error.message : String(error || "Task failed");
  const canRetry = Number(task.attempts || 0) < policy.maxAttempts;
  const completed = nowIso();
  updateRun(store, run.id, {
    status: "failed",
    completedAt: completed,
    durationMs: Math.max(0, Date.parse(completed) - Date.parse(run.startedAt)),
    summary: canRetry ? `Task ${task.kind} will retry: ${message}` : `Task ${task.kind} failed: ${message}`,
    issues: [{
      schemaVersion: 1,
      severity: "error",
      category: "queue",
      code: canRetry ? "task_retry_scheduled" : "task_failed",
      message,
    }],
  });
  const delayMs = retryDelayMs(task.attempts, policy);
  const nextStatus = canRetry ? "retrying" : "dead-letter";
  const next = updateTask(store, {
    ...task,
    status: nextStatus,
    runId: run.id,
    lockedAt: null,
    leaseExpiresAt: null,
    availableAt: canRetry ? new Date(Date.now() + delayMs).toISOString() : task.availableAt,
    lastError: message,
    deadLetteredAt: canRetry ? null : completed,
  });
  if (!canRetry) {
    store.writeJson(deadLetterPath(next.taskId), {
      ...next,
      status: "dead-letter",
      deadLetterReason: message,
      deadLetteredAt: completed,
    });
  }
  appendAuditEvent(store, {
    type: canRetry ? "job.retry_scheduled" : "job.dead_lettered",
    source: "queue-service",
    status: next.status,
    safeSummary: canRetry ? `Task ${task.kind} scheduled for retry.` : `Task ${task.kind} moved to dead-letter.`,
    details: { taskId: task.taskId, runId: run.id, attempts: next.attempts, delayMs: canRetry ? delayMs : 0 },
  });
  return next;
}

function runTask(store, taskId, options = {}) {
  const task = getTask(store, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (!["pending", "ready", "retrying", "running"].includes(task.status)) {
    throw new Error(`Task is not runnable: ${task.status}`);
  }
  if (task.status !== "running" && !isDue(task)) {
    throw new Error(`Task is not due until ${task.availableAt || task.nextRunAt}`);
  }
  const leased = task.status === "running" ? task : updateTask(store, {
    ...task,
    status: "running",
    attempts: Number(task.attempts || 0) + 1,
    lockedAt: nowIso(),
    leaseExpiresAt: new Date(Date.now() + Number(options.leaseMs || 30000)).toISOString(),
    lastError: null,
  });
  const started = nowIso();
  const definition = ALLOWED_TASKS[task.type || task.kind];
  if (!definition) throw new Error(`Task type not allowed: ${task.type || task.kind}`);
  const run = createRun(store, {
    kind: leased.kind,
    command: leased.command,
    summary: `Queued task ${leased.kind}`,
    startedAt: started,
    source: "queue-worker",
  });
  const running = updateTask(store, { ...leased, runId: run.id });
  try {
    const outcome = executeTaskDefinition(store, running, definition, options);
    return finishTask(store, running, run, outcome);
  } catch (error) {
    return retryOrFailTask(store, running, run, error);
  }
}

function processQueue(store, options = {}) {
  const limit = Number(options.limit || options.concurrency || 1);
  const results = [];
  for (let index = 0; index < limit; index += 1) {
    const task = leaseNextTask(store, options);
    if (!task) break;
    results.push(runTask(store, task.taskId, options));
  }
  return {
    schemaVersion: 1,
    processed: results.length,
    tasks: results,
  };
}

function startQueueWorker(store, options = {}) {
  const intervalMs = Number(options.intervalMs || 1000);
  const limit = Number(options.limit || options.concurrency || 1);
  let stopped = false;
  let active = false;
  const tick = () => {
    if (stopped || active) return;
    active = true;
    try {
      processQueue(store, { ...options, limit });
    } finally {
      active = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  tick();
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
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
  leaseNextTask,
  listDeadLetters,
  listTasks,
  processQueue,
  runTask,
  startQueueWorker,
};
