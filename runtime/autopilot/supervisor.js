"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { JsonFileRunStore } = require("../store");
const { resolveMaestroRoot } = require("../config/maestro-paths");
const { clone, requireText } = require("./contracts");

function watchIdFor({ projectId, runId, taskId = "mission", blockerId = "condition", condition, watchRef }) {
  const key = [projectId, runId, taskId, blockerId, condition, watchRef].join("\u001f");
  return `watch-${crypto.createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

function nowFrom(clock) {
  const value = typeof clock === "function" ? clock() : new Date();
  return value instanceof Date ? value : new Date(value);
}

function normalizeWatch(input = {}, clock = () => new Date()) {
  const projectId = requireText(input.project_id ?? input.projectId, "watch.project_id");
  const runId = requireText(input.run_id ?? input.runId, "watch.run_id");
  const condition = requireText(input.condition, "watch.condition");
  const watchRef = requireText(input.watch_ref ?? input.watchRef, "watch.watch_ref");
  const taskId = input.task_id ?? input.taskId ?? null;
  const blockerId = input.blocker_id ?? input.blockerId ?? null;
  const createdAt = input.created_at ?? input.createdAt ?? nowFrom(clock).toISOString();
  return {
    id: input.id || input.watch_id || input.watchId || watchIdFor({ projectId, runId, taskId, blockerId, condition, watchRef }),
    watchId: input.watch_id || input.watchId || input.id || watchIdFor({ projectId, runId, taskId, blockerId, condition, watchRef }),
    projectId,
    projectRoot: input.project_root ?? input.projectRoot ?? null,
    runId,
    taskId,
    blockerId,
    condition,
    watchRef,
    resourceRef: input.resource_ref ?? input.resourceRef ?? null,
    recheckAt: input.recheck_at ?? input.recheckAt ?? null,
    status: input.status || "active",
    createdAt,
    updatedAt: input.updated_at ?? input.updatedAt ?? createdAt,
    lastCheckedAt: input.last_checked_at ?? input.lastCheckedAt ?? null,
    lastError: input.last_error ?? input.lastError ?? null,
    attempts: Number.isInteger(input.attempts) && input.attempts >= 0 ? input.attempts : 0
  };
}

class MissionSupervisor {
  constructor({ store, leaseFilePath, scheduler, council, executionAdapter, executionAdapterFactory, controllerFactory, clock = () => new Date() } = {}) {
    this.store = store || new JsonFileRunStore({ filePath: leaseFilePath || path.join(resolveMaestroRoot(), "runtime", "runs.json") });
    this.scheduler = scheduler || null;
    this.council = council || null;
    this.executionAdapter = executionAdapter || null;
    this.executionAdapterFactory = executionAdapterFactory;
    this.controllerFactory = controllerFactory;
    this.clock = clock;
  }

  async initialize() {
    await this.store.initialize();
    return this;
  }

  async register(input) {
    await this.initialize();
    const watch = normalizeWatch(input, this.clock);
    return this.store.transactAutopilotWatches(async (watches) => {
      const index = watches.findIndex((candidate) => candidate.watchId === watch.watchId);
      const existing = index === -1 ? null : watches[index];
      const merged = {
        ...(existing || {}),
        ...watch,
        status: "active",
        updatedAt: nowFrom(this.clock).toISOString(),
        attempts: existing?.attempts || watch.attempts || 0,
        lastError: null
      };
      if (index === -1) watches.push(merged);
      else watches[index] = merged;
      return { watches, value: clone(merged) };
    });
  }

  async list(filters = {}) {
    await this.initialize();
    return this.store.listAutopilotWatches(filters);
  }

  async _setStatus(watchId, patch) {
    return this.store.transactAutopilotWatches(async (watches) => {
      const index = watches.findIndex((candidate) => candidate.watchId === watchId);
      if (index === -1) return { watches, value: null };
      watches[index] = { ...watches[index], ...clone(patch), updatedAt: nowFrom(this.clock).toISOString() };
      return { watches, value: clone(watches[index]) };
    });
  }

  async _conditionSatisfied(watch, probe) {
    if (typeof probe === "function") return Boolean(await probe(clone(watch)));
    const now = nowFrom(this.clock);
    if (watch.recheckAt && Number.isFinite(Date.parse(watch.recheckAt)) && Date.parse(watch.recheckAt) <= now.getTime()) return true;
    if (watch.watchRef === "maestro-scheduler" || watch.condition === "capacity_unavailable" || watch.condition === "minimum_not_available") {
      if (!this.scheduler || typeof this.scheduler.snapshot !== "function") return false;
      const snapshot = await this.scheduler.snapshot();
      return snapshot.availableAgents > 0;
    }
    if (watch.watchRef === "autopilot-council" || watch.condition === "council_route_available") {
      if (!this.council) return false;
      if (typeof this.council.isAvailable === "function") return Boolean(await this.council.isAvailable());
      return typeof this.council.consult === "function" || typeof this.council === "function";
    }
    return false;
  }

  async _makeController(watch) {
    if (typeof this.controllerFactory === "function") return this.controllerFactory({ watch, supervisor: this });
    // Lazy import prevents a module cycle: the controller can optionally own
    // a supervisor while the default supervisor can still reconstruct one.
    const { AutopilotMissionController } = require("./mission-controller");
    return new AutopilotMissionController({
      projectRoot: watch.projectRoot || process.cwd(),
      projectId: watch.projectId,
      leaseStore: this.store,
      council: this.council,
      scheduler: this.scheduler,
      supervisor: this
    });
  }

  async _reconcileWatch(watch) {
    const controller = await this._makeController(watch);
    try {
      let outcome;
      if (watch.watchRef === "autopilot-council" || watch.condition === "council_route_available") {
        outcome = await controller.recoverBlocker(watch.blockerId);
      } else if (typeof controller.reconcileCondition === "function") {
        outcome = await controller.reconcileCondition(watch);
      } else {
        outcome = await controller.resume();
      }
      const executionAdapter = typeof this.executionAdapterFactory === "function"
        ? await this.executionAdapterFactory({ watch, supervisor: this })
        : this.executionAdapter;
      if (!executionAdapter || typeof controller.dispatchReady !== "function") return outcome;
      const status = await controller.status();
      if (!new Set(["dispatch_ready", "dispatch_remediation"]).has(status.nextAction?.type)) return outcome;
      const dispatch = await controller.dispatchReady({ adapter: executionAdapter });
      const events = [];
      for (const started of dispatch.started || []) {
        const response = started.response || {};
        const completed = response.run?.status === "completed"
          || ["COMPLETED", "COMPLETED_CLEANUP_PENDING"].includes(response.status);
        const event = await controller.ingestEvent({
          event_id: `SUPERVISOR-${started.taskId}-${Date.now()}`,
          source: executionAdapter.id || "autopilot-supervisor",
          event_type: completed ? "execution.completed" : "execution.failed",
          project_id: status.projectId,
          run_id: status.runId,
          task_id: started.taskId,
          attempt_id: started.task?.attempt_id,
          result_ref: response.run?.id || response.id || null,
          evidence_refs: response.evidence?.map((item) => item.id).filter(Boolean) || [],
          reason: response.execution?.error || response.error || (completed ? null : response.status || "provider_execution_failed")
        });
        events.push(event);
      }
      return { outcome, dispatch, events };
    } finally {
      await controller.release();
    }
  }

  async tick({ probe } = {}) {
    await this.initialize();
    const now = nowFrom(this.clock);
    const active = await this.list({ status: "active" });
    const result = { checked: 0, resolved: [], pending: [], errors: [] };
    for (const watch of active) {
      result.checked += 1;
      const satisfied = await this._conditionSatisfied(watch, probe);
      await this._setStatus(watch.watchId, { lastCheckedAt: now.toISOString() });
      if (!satisfied) {
        result.pending.push(watch.watchId);
        continue;
      }
      try {
        await this._reconcileWatch(watch);
        await this._setStatus(watch.watchId, { status: "resolved", resolvedAt: now.toISOString(), lastError: null });
        result.resolved.push(watch.watchId);
      } catch (error) {
        await this._setStatus(watch.watchId, { attempts: watch.attempts + 1, lastError: error.message || String(error) });
        result.errors.push({ watchId: watch.watchId, code: error.code || "SUPERVISOR_RECONCILIATION_FAILED", message: error.message || String(error) });
      }
    }
    return result;
  }

  async run({ intervalMs = 10_000, signal, onTick } = {}) {
    if (!Number.isInteger(intervalMs) || intervalMs < 100) throw new TypeError("intervalMs must be an integer >= 100");
    while (!signal?.aborted) {
      const result = await this.tick();
      if (typeof onTick === "function") await onTick(result);
      if (signal?.aborted) break;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

module.exports = { MissionSupervisor, normalizeWatch, watchIdFor };
