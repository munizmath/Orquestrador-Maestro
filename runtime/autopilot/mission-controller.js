"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { JsonFileRunStore } = require("../store");
const { resolveMaestroRoot } = require("../config/maestro-paths");
const { SharedElasticScheduler } = require("./scheduler");
const { MissionArtifacts } = require("./artifacts");
const {
  COUNCIL_OUTPUTS,
  MISSION_STATUSES,
  TASK_STATUSES,
  TERMINAL_TASK_STATUSES,
  clone,
  id,
  normalizeResourcePolicy,
  normalizeTask,
  requireText,
  timestamp,
  validateCouncilOutput,
  validateExecutionEvent
} = require("./contracts");

const ACTIVE_MISSION_STATUSES = new Set(["queued", "running", "waiting", "paused"]);

function projectIdForPath(projectRoot) {
  return `project-${crypto.createHash("sha256").update(path.resolve(projectRoot)).digest("hex").slice(0, 16)}`;
}

function errorWithCode(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isTerminalTask(task) {
  return TERMINAL_TASK_STATUSES.has(task.status);
}

function dependenciesSatisfied(task, tasks) {
  const byId = new Map(tasks.map((candidate) => [candidate.task_id, candidate]));
  return task.depends_on.every((dependency) => byId.get(dependency)?.status === "completed");
}

function hasIndependentWork(tasks, excludedTaskId) {
  return tasks.some((task) => task.task_id !== excludedTaskId && task.status === "queued" && dependenciesSatisfied(task, tasks));
}

function decisionIsUsable(decision, now = Date.now()) {
  if (!decision || decision.status !== "active") return false;
  const effectiveFrom = Date.parse(decision.effective_from || "");
  const expiresAt = decision.expires_at ? Date.parse(decision.expires_at) : null;
  return Number.isFinite(effectiveFrom) && effectiveFrom <= now && (expiresAt === null || Number.isFinite(expiresAt) && expiresAt > now);
}

function defaultBoundaries({ objective, resourcePolicy }) {
  return {
    schema_version: 2,
    revision: 1,
    objective,
    non_goals: [],
    authorized_operations: [],
    reserved_choices: [],
    decision_refs: [],
    cost_limits: {},
    time_limits: {},
    resource_policy: resourcePolicy,
    rollback: null,
    completion_definition: "All required tasks and gates satisfy their current criteria and dispositions.",
    created_at: new Date().toISOString()
  };
}

function defaultArtifacts({ projectId, runId, objective, resourcePolicy, lease }) {
  const now = new Date().toISOString();
  const boundaries = defaultBoundaries({ objective, resourcePolicy });
  const tasks = { schema_version: 2, revision: 1, tasks: [], blockers: [] };
  const validation = { schema_version: 2, revision: 1, gates: [], evidence: [], decisions: [], councils: [], events: [] };
  const checkpoint = {
    schema_version: 2,
    project_id: projectId,
    run_id: runId,
    revision: 1,
    status: "running",
    phase: "intake",
    document_revisions: { boundaries: 1, tasks: 1, validation: 1 },
    active_task_ids: [],
    blocker_ids: [],
    council_ref: null,
    controller_lease_ref: lease.id,
    controller_lease_epoch: lease.epoch,
    waiting_for: null,
    next_action: { type: "expand_mission" },
    created_at: now,
    updated_at: now
  };
  const survival = {
    schema_version: 2,
    revision: 1,
    status: "running",
    phase: "intake",
    completed_task_ids: [],
    active_task_ids: [],
    waiting_task_ids: [],
    decisions: [],
    next_action: checkpoint.next_action,
    source_revisions: { boundaries: 1, tasks: 1, validation: 1, checkpoint: 1 },
    generated_at: now
  };
  return { checkpoint, boundaries, tasks, validation, survival };
}

class AutopilotMissionController {
  constructor({
    projectRoot = process.cwd(),
    projectId,
    controllerId,
    leaseStore,
    leaseFilePath,
    leaseTtlMs = 60_000,
    leaseHeartbeatMs = Math.max(1_000, Math.floor(leaseTtlMs / 3)),
    scheduler,
    council,
    supervisor,
    clock = () => new Date()
  } = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.projectId = projectId || projectIdForPath(this.projectRoot);
    this.controllerId = controllerId || `controller-${process.pid}-${crypto.randomUUID()}`;
    this.leaseTtlMs = leaseTtlMs;
    this.leaseHeartbeatMs = leaseHeartbeatMs;
    this.clock = clock;
    this.artifacts = new MissionArtifacts(this.projectRoot);
    this.leaseStore = leaseStore || new JsonFileRunStore({
      filePath: leaseFilePath || path.join(resolveMaestroRoot(), "runtime", "runs.json")
    });
    const configuredMaxAgents = Number.parseInt(process.env.MAESTRO_MAX_AGENTS || "20", 10);
    this.scheduler = scheduler || new SharedElasticScheduler({
      store: this.leaseStore,
      maxAgents: Number.isInteger(configuredMaxAgents) && configuredMaxAgents > 0 ? configuredMaxAgents : 20
    });
    this.council = council || null;
    this.supervisor = supervisor || null;
    this.lease = null;
    this._leaseHeartbeat = null;
    this._leaseRenewal = null;
    this._queue = Promise.resolve();
  }

  async initialize() {
    await this.leaseStore.initialize();
    return this;
  }

  _enqueue(operation) {
    const next = this._queue.then(operation);
    this._queue = next.catch(() => undefined);
    return next;
  }

  _now() {
    const value = this.clock();
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  _resourceId() {
    return `project:${this.projectId}:control`;
  }

  _startLeaseHeartbeat() {
    if (this._leaseHeartbeat || !this.lease) return;
    this._leaseHeartbeat = setInterval(() => {
      if (this._leaseRenewal || !this.lease) return;
      this._leaseRenewal = this.leaseStore.renewLease({ ...this.lease, ttlMs: this.leaseTtlMs })
        .then((renewed) => { this.lease = renewed; })
        .catch(() => { /* The next protected operation will fail closed. */ })
        .finally(() => { this._leaseRenewal = null; });
    }, this.leaseHeartbeatMs);
    this._leaseHeartbeat.unref?.();
  }

  _stopLeaseHeartbeat() {
    if (this._leaseHeartbeat) clearInterval(this._leaseHeartbeat);
    this._leaseHeartbeat = null;
  }

  async _acquireForState(state) {
    if (!state?.checkpoint) throw new Error("Autopilot mission artifacts do not exist");
    if (this.lease) {
      try {
        this.lease = await this.leaseStore.renewLease({ ...this.lease, ttlMs: this.leaseTtlMs });
        this._startLeaseHeartbeat();
        return this.lease;
      } catch (error) {
        if (!new Set(["LEASE_EXPIRED", "STALE_LEASE"]).has(error?.code)) throw error;
        this.lease = null;
      }
    }
    this.lease = await this.leaseStore.acquireLease({
      resourceId: this._resourceId(),
      holderId: this.controllerId,
      ttlMs: this.leaseTtlMs
    });
    this._startLeaseHeartbeat();
    return this.lease;
  }

  _deriveSurvival(state) {
    const tasks = state.tasks.tasks || [];
    return {
      schema_version: 2,
      revision: (state.survival.revision || 0) + 1,
      status: state.checkpoint.status,
      phase: state.checkpoint.phase,
      completed_task_ids: tasks.filter((task) => task.status === "completed").map((task) => task.task_id),
      active_task_ids: tasks.filter((task) => !isTerminalTask(task)).map((task) => task.task_id),
      waiting_task_ids: tasks.filter((task) => ["waiting", "paused"].includes(task.status)).map((task) => task.task_id),
      decisions: (state.validation.decisions || []).filter((decision) => decisionIsUsable(decision)).map((decision) => decision.decision_id),
      next_action: clone(state.checkpoint.next_action),
      source_revisions: {
        boundaries: state.boundaries.revision,
        tasks: state.tasks.revision,
        validation: state.validation.revision,
        checkpoint: state.checkpoint.revision + 1
      },
      generated_at: this._now()
    };
  }

  _prepareCommit(state, changed, lease) {
    for (const name of new Set(changed || [])) {
      if (!["boundaries", "tasks", "validation"].includes(name)) continue;
      state[name].revision = (state[name].revision || 0) + 1;
    }
    state.checkpoint.revision = (state.checkpoint.revision || 0) + 1;
    state.checkpoint.document_revisions = {
      boundaries: state.boundaries.revision,
      tasks: state.tasks.revision,
      validation: state.validation.revision
    };
    state.checkpoint.controller_lease_ref = lease.id;
    state.checkpoint.controller_lease_epoch = lease.epoch;
    state.checkpoint.updated_at = this._now();
    state.checkpoint.active_task_ids = state.tasks.tasks.filter((task) => !isTerminalTask(task)).map((task) => task.task_id);
    state.checkpoint.blocker_ids = state.tasks.blockers.filter((blocker) => blocker.status === "open").map((blocker) => blocker.blocker_id);
    state.survival = this._deriveSurvival(state);
    return state;
  }

  async _mutate(mutator, defaultChanged = ["tasks"]) {
    await this.initialize();
    const current = await this.artifacts.readAll();
    if (!current) throw errorWithCode("AUTOPILOT_NOT_INITIALIZED", "Autopilot mission artifacts do not exist; start a mission first.");
    const lease = await this._acquireForState(current);
    return this.leaseStore.withLease(lease, async (verifiedLease) => {
      this.lease = verifiedLease;
      const next = clone(current);
      const result = await mutator(next, verifiedLease);
      const changed = result?.changed || defaultChanged;
      this._prepareCommit(next, changed, verifiedLease);
      await this.artifacts.writeAll(next);
      return { state: next, result: result?.value ?? result ?? null };
    });
  }

  async start({ objective, runId = id("RUN"), boundaries = {}, resourcePolicy = {}, mode = "standard" } = {}) {
    return this._enqueue(async () => {
      await this.initialize();
      requireText(objective, "objective");
      const existing = await this.artifacts.readAll();
      if (existing) throw errorWithCode("AUTOPILOT_ALREADY_INITIALIZED", "Autopilot mission artifacts already exist; use resume or inspect the current mission.");
      const policy = normalizeResourcePolicy(resourcePolicy);
      const lease = await this.leaseStore.acquireLease({ resourceId: this._resourceId(), holderId: this.controllerId, ttlMs: this.leaseTtlMs });
      try {
        const result = await this.leaseStore.withLease(lease, async (verifiedLease) => {
          this.lease = verifiedLease;
          this._startLeaseHeartbeat();
          const initial = defaultArtifacts({ projectId: this.projectId, runId, objective: objective.trim(), resourcePolicy: policy, lease: verifiedLease });
          initial.boundaries = { ...initial.boundaries, ...clone(boundaries), schema_version: 2, revision: 1, objective: objective.trim(), resource_policy: policy };
          initial.checkpoint.mode = mode;
          await this.artifacts.writeAll(initial);
          return this.statusFrom(initial);
        });
        return result;
      } catch (error) {
        this._stopLeaseHeartbeat();
        this.lease = null;
        try { await this.leaseStore.releaseLease(lease); } catch { /* preserve original failure */ }
        throw error;
      }
    });
  }

  async resume() {
    return this._enqueue(async () => {
      await this.initialize();
      const current = await this.artifacts.readAll();
      if (!current) throw errorWithCode("AUTOPILOT_NOT_INITIALIZED", "Autopilot mission artifacts do not exist; start a mission first.");
      if (current.checkpoint.status === "completed") return this.statusFrom(current);
      const result = await this._mutate((state) => {
        state.checkpoint.status = "running";
        state.checkpoint.phase = "recovery";
        state.checkpoint.waiting_for = null;
        state.checkpoint.next_action = { type: "reconcile_and_continue" };
        return { changed: ["tasks", "validation"], value: null };
      });
      return this.statusFrom(result.state);
    });
  }

  async status() {
    await this.initialize();
    const state = await this.artifacts.readAll();
    if (!state) return { initialized: false, projectId: this.projectId, projectRoot: this.projectRoot, artifactRoot: this.artifacts.root };
    return this.statusFrom(state);
  }

  statusFrom(state) {
    return {
      initialized: true,
      projectId: state.checkpoint.project_id,
      runId: state.checkpoint.run_id,
      projectRoot: this.projectRoot,
      artifactRoot: this.artifacts.root,
      status: state.checkpoint.status,
      phase: state.checkpoint.phase,
      revision: state.checkpoint.revision,
      activeTaskIds: clone(state.checkpoint.active_task_ids),
      blockerIds: clone(state.checkpoint.blocker_ids),
      nextAction: clone(state.checkpoint.next_action),
      waitingFor: clone(state.checkpoint.waiting_for),
      controllerLease: this.lease ? { id: this.lease.id, epoch: this.lease.epoch, expiresAt: this.lease.expiresAt } : null,
      artifacts: {
        checkpoint: this.artifacts.pathFor("checkpoint"),
        boundaries: this.artifacts.pathFor("boundaries"),
        tasks: this.artifacts.pathFor("tasks"),
        validation: this.artifacts.pathFor("validation"),
        survival: this.artifacts.pathFor("survival")
      }
    };
  }

  async addTasks(tasks) {
    return this._enqueue(async () => {
      const values = Array.isArray(tasks) ? tasks : [tasks];
      const result = await this._mutate((state) => {
        const existing = new Set(state.tasks.tasks.map((task) => task.task_id));
        const added = values.map((task, index) => normalizeTask(task, { index, clock: this.clock }));
        for (const task of added) {
          if (existing.has(task.task_id)) throw errorWithCode("TASK_ALREADY_EXISTS", `task already exists: ${task.task_id}`);
          existing.add(task.task_id);
          state.tasks.tasks.push(task);
        }
        state.checkpoint.status = "running";
        state.checkpoint.phase = "planning";
        state.checkpoint.next_action = { type: "dispatch_ready" };
        return { changed: ["tasks"], value: added };
      });
      return result.result;
    });
  }

  async recordDecision(decision = {}) {
    return this._enqueue(async () => {
      const result = await this._mutate((state) => {
        const decisionId = requireText(decision.decision_id ?? decision.decisionId ?? id("DECISION"), "decision.decision_id");
        const record = {
          decision_id: decisionId,
          revision: Number.isInteger(decision.revision) && decision.revision > 0 ? decision.revision : 1,
          authority_ref: requireText(decision.authority_ref ?? decision.authorityRef ?? "user", "decision.authority_ref"),
          source_ref: requireText(decision.source_ref ?? decision.sourceRef ?? decisionId, "decision.source_ref"),
          effect: requireText(decision.effect, "decision.effect"),
          scope: clone(decision.scope || {}),
          authorized_operations: Array.isArray(decision.authorized_operations) ? clone(decision.authorized_operations) : [],
          limits: clone(decision.limits || {}),
          status: decision.status || "active",
          effective_from: decision.effective_from || this._now(),
          expires_at: decision.expires_at || null,
          supersedes: decision.supersedes || null,
          revokes: decision.revokes || null,
          authorizes_completion: decision.authorizes_completion === true
        };
        state.validation.decisions = state.validation.decisions.filter((candidate) => candidate.decision_id !== decisionId);
        state.validation.decisions.push(record);
        if (!state.boundaries.decision_refs.includes(decisionId)) state.boundaries.decision_refs.push(decisionId);
        return { changed: ["boundaries", "validation"], value: record };
      });
      return result.result;
    });
  }

  async completeTask({ taskId, technicalResult = "pass", disposition = "accepted", decisionRef = null, verificationRefs = [], evidenceRef = null, environmentRef = null, artifactRef = null } = {}) {
    return this._enqueue(async () => {
      const result = await this._mutate((state) => {
        const task = state.tasks.tasks.find((candidate) => candidate.task_id === taskId);
        if (!task) throw errorWithCode("TASK_NOT_FOUND", `task not found: ${taskId}`);
        const technicalAliases = { passed: "pass", succeeded: "pass", failed: "fail" };
        const technical = technicalAliases[String(technicalResult).toLowerCase()] || String(technicalResult).toLowerCase();
        if (!new Set(["pass", "fail"]).has(technical)) throw new TypeError("technicalResult must be pass or fail");
        const decisions = state.validation.decisions || [];
        const decision = decisionRef ? decisions.find((candidate) => candidate.decision_id === decisionRef && decisionIsUsable(candidate)) : null;
        if (technical === "fail" && (!decision || decision.authorizes_completion !== true)) {
          throw errorWithCode("COMPLETION_NOT_AUTHORIZED", "a failed technical result needs an active decision that expressly authorizes completion");
        }
        task.status = "completed";
        task.verification_refs = [...new Set([...task.verification_refs, ...verificationRefs])];
        task.blocker_ref = null;
        task.updated_at = this._now();
        state.validation.gates.push({
          gate_id: id("GATE"),
          task_id: taskId,
          artifact_ref: artifactRef,
          environment_ref: environmentRef,
          technical_result: technical,
          evidence_ref: evidenceRef,
          disposition,
          decision_ref: decisionRef,
          recorded_at: this._now()
        });
        state.checkpoint.phase = "validation";
        state.checkpoint.next_action = { type: "verify_mission" };
        return { changed: ["tasks", "validation"], value: task };
      });
      return result.result;
    });
  }

  async completeMission() {
    return this._enqueue(async () => {
      const result = await this._mutate((state) => {
        const incomplete = state.tasks.tasks.filter((task) => task.status !== "completed");
        if (incomplete.length > 0) throw errorWithCode("MISSION_INCOMPLETE", `mission has incomplete tasks: ${incomplete.map((task) => task.task_id).join(", ")}`);
        for (const gate of state.validation.gates) {
          if (gate.technical_result !== "pass") {
            const decision = state.validation.decisions.find((candidate) => candidate.decision_id === gate.decision_ref && decisionIsUsable(candidate));
            if (!decision || decision.authorizes_completion !== true) throw errorWithCode("GATE_BLOCKING", `gate remains blocking: ${gate.gate_id}`);
          }
        }
        state.checkpoint.status = "completed";
        state.checkpoint.phase = "handoff";
        state.checkpoint.waiting_for = null;
        state.checkpoint.next_action = { type: "handoff" };
        state.checkpoint.completed_at = this._now();
        return { changed: ["tasks", "validation"], value: state.checkpoint };
      });
      return this.statusFrom(result.state);
    });
  }

  async dispatchReady({ adapter, resourcePolicy } = {}) {
    return this._enqueue(async () => {
      const current = await this.artifacts.readAll();
      if (!current) throw errorWithCode("AUTOPILOT_NOT_INITIALIZED", "Autopilot mission artifacts do not exist; start a mission first.");
      const ready = current.tasks.tasks.filter((task) => task.status === "queued" && dependenciesSatisfied(task, current.tasks.tasks));
      const policy = normalizeResourcePolicy(resourcePolicy || current.boundaries.resource_policy);
      const allocation = await this.scheduler.requestCapacity({
        projectId: this.projectId,
        readyLanes: ready.length,
        minAgents: policy.min_agents,
        preferredAgents: policy.preferred_agents,
        maxAgents: policy.max_agents,
        allowSerialFallback: policy.allow_serial_fallback,
        poolIds: policy.pool_ids
      });
      if (allocation.status !== "granted") {
        const result = await this._mutate((state) => {
          state.checkpoint.status = state.tasks.tasks.some((task) => task.status === "running") ? "running" : "waiting";
          state.checkpoint.phase = "execution";
          state.checkpoint.waiting_for = { type: "capacity", condition: allocation.reason, watch_ref: "maestro-scheduler", recheck_at: null };
          state.checkpoint.next_action = { type: "request_capacity" };
          return { changed: ["tasks"], value: allocation };
        });
        if (this.supervisor) await this.supervisor.register({
          projectId: this.projectId,
          projectRoot: this.projectRoot,
          runId: current.checkpoint.run_id,
          condition: allocation.reason,
          watchRef: "maestro-scheduler",
          resourceRef: null
        });
        return result.result;
      }
      if (!adapter || typeof adapter.startTask !== "function") {
        await this.scheduler.releaseCapacity(allocation.allocationId);
        throw errorWithCode("ADAPTER_UNAVAILABLE", "an execution adapter with startTask is required to dispatch a lane");
      }
      const selected = ready.slice(0, allocation.agentCount);
      const claims = await this._mutate((state) => {
        const claimed = [];
        for (const task of selected) {
          const stored = state.tasks.tasks.find((candidate) => candidate.task_id === task.task_id);
          if (!stored || stored.status !== "queued") continue;
          stored.status = "running";
          stored.owner = adapter.id || "adapter";
          stored.attempt_id = id("ATTEMPT");
          stored.operation_id = id("OPERATION");
          stored.allocation_ref = allocation.allocationId;
          stored.updated_at = this._now();
          claimed.push(clone(stored));
        }
        state.checkpoint.status = "running";
        state.checkpoint.phase = "execution";
        state.checkpoint.waiting_for = null;
        state.checkpoint.next_action = { type: "await_events", task_ids: claimed.map((task) => task.task_id) };
        return { changed: ["tasks"], value: claimed };
      });
      const started = [];
      try {
        for (const task of claims.result) {
          const response = await adapter.startTask({ projectId: this.projectId, runId: current.checkpoint.run_id, task, workspacePath: this.projectRoot });
          started.push({ taskId: task.task_id, response });
        }
        return { allocation, claims: claims.result, started };
      } catch (error) {
        await this.scheduler.releaseCapacity(allocation.allocationId);
        throw error;
      }
    });
  }

  async ingestEvent(event) {
    return this._enqueue(async () => {
      const normalized = validateExecutionEvent(event);
      const current = await this.artifacts.readAll();
      if (!current) throw errorWithCode("AUTOPILOT_NOT_INITIALIZED", "Autopilot mission artifacts do not exist; start a mission first.");
      if (normalized.project_id !== this.projectId || normalized.run_id !== current.checkpoint.run_id) throw errorWithCode("EVENT_OUT_OF_SCOPE", "execution event does not belong to this mission");
      const result = await this._mutate((state) => {
        const duplicate = state.validation.events.some((candidate) => candidate.source === normalized.source && candidate.event_id === normalized.event_id);
        if (duplicate) return { changed: [], value: { duplicate: true, event: normalized } };
        state.validation.events.push(normalized);
        const task = normalized.task_id ? state.tasks.tasks.find((candidate) => candidate.task_id === normalized.task_id) : null;
        let councilRequest = null;
        if (task && normalized.event_type === "execution.completed") {
          task.result_refs = normalized.result_ref ? [...new Set([...task.result_refs, normalized.result_ref])] : task.result_refs;
          task.verification_refs = [...new Set([...task.verification_refs, ...normalized.evidence_refs])];
          task.updated_at = this._now();
          state.checkpoint.phase = "validation";
          state.checkpoint.next_action = { type: "verify_task", task_id: task.task_id };
          task.allocation_ref = null;
        } else if (task && normalized.event_type === "execution.failed") {
          const blocker = { blocker_id: id("BLOCK"), task_id: task.task_id, reason: normalized.reason || "technical_failure", status: "open", event_ref: `${normalized.source}:${normalized.event_id}`, created_at: this._now() };
          state.tasks.blockers.push(blocker);
          task.blocker_ref = blocker.blocker_id;
          task.status = "waiting";
          task.allocation_ref = null;
          task.updated_at = this._now();
          state.checkpoint.phase = "recovery";
          state.checkpoint.next_action = { type: "invoke_council", blocker_id: blocker.blocker_id };
          state.checkpoint.status = hasIndependentWork(state.tasks.tasks, task.task_id) ? "running" : "waiting";
          state.checkpoint.waiting_for = state.checkpoint.status === "waiting" ? { type: "council", condition: "council_result_available", watch_ref: "autopilot-council", recheck_at: null } : null;
          councilRequest = { blocker: clone(blocker), task: clone(task), event: normalized, mission: clone(state.checkpoint) };
        } else if (task && normalized.event_type === "execution.cancelled") {
          task.status = "paused";
          task.allocation_ref = null;
          task.updated_at = this._now();
          state.checkpoint.phase = "recovery";
          state.checkpoint.next_action = { type: "reconcile_cancelled_task", task_id: task.task_id };
        } else if (normalized.event_type === "resource.changed") {
          for (const candidate of state.tasks.tasks) {
            if (candidate.status === "waiting" && candidate.resource_refs.includes(normalized.resource_ref)) candidate.status = "queued";
          }
          state.checkpoint.status = "running";
          state.checkpoint.waiting_for = null;
          state.checkpoint.next_action = { type: "dispatch_ready" };
        }
        return { changed: ["tasks", "validation"], value: { duplicate: false, event: normalized, councilRequest } };
      });
      if (!result.result?.duplicate && result.result?.councilRequest) {
        const outcome = await this._consultCouncil(result.result.councilRequest);
        await this._applyCouncilOutcomeInternal(outcome, result.result.councilRequest.blocker.blocker_id);
        result.result.council = outcome;
      }
      const releasedAllocations = new Set();
      if (!result.result?.duplicate && normalized.task_id && ["execution.completed", "execution.failed", "execution.cancelled"].includes(normalized.event_type)) {
        const priorTask = current.tasks.tasks.find((candidate) => candidate.task_id === normalized.task_id);
        if (priorTask?.allocation_ref) releasedAllocations.add(priorTask.allocation_ref);
      }
      for (const allocationId of releasedAllocations) await this.scheduler.releaseCapacity(allocationId);
      return result.result;
    });
  }

  async _consultCouncil(request) {
    if (!this.council) return { output: "WAITING_CONDITION", condition: "council_route_available", watch_ref: "maestro-capacity", reason: "no council adapter configured" };
    const consult = typeof this.council === "function" ? this.council : this.council.consult;
    if (typeof consult !== "function") return { output: "WAITING_CONDITION", condition: "council_route_available", watch_ref: "maestro-capacity", reason: "council adapter has no consult operation" };
    const outcome = await consult(request);
    if (!outcome || typeof outcome !== "object") return { output: "UNRESOLVED", rationale: "council returned no structured outcome" };
    return outcome;
  }

  async applyCouncilOutcome(outcome, blockerId) {
    return this._enqueue(() => this._applyCouncilOutcomeInternal(outcome, blockerId));
  }

  async _applyCouncilOutcomeInternal(outcome, blockerId) {
    const normalizedOutput = validateCouncilOutput(outcome?.output);
    if (normalizedOutput === "RESOLVED" && (!Array.isArray(outcome.evidence_refs ?? outcome.evidenceRefs) || (outcome.evidence_refs ?? outcome.evidenceRefs).length === 0)) {
      throw errorWithCode("COUNCIL_EVIDENCE_REQUIRED", "RESOLVED council output requires evidence_refs");
    }
    if (normalizedOutput === "REMEDIATION_PLAN" && (!Array.isArray(outcome.tasks || outcome.remediation?.tasks) || (outcome.tasks || outcome.remediation?.tasks).length === 0)) {
      throw errorWithCode("COUNCIL_PLAN_INVALID", "REMEDIATION_PLAN council output requires at least one concrete task");
    }
    const result = await this._mutate((state) => {
      const blocker = state.tasks.blockers.find((candidate) => candidate.blocker_id === blockerId);
      if (!blocker) throw errorWithCode("BLOCKER_NOT_FOUND", `blocker not found: ${blockerId}`);
      const task = state.tasks.tasks.find((candidate) => candidate.task_id === blocker.task_id);
      const councilRef = outcome.council_ref || id("COUNCIL");
      state.validation.councils.push({ council_ref: councilRef, blocker_id: blockerId, output: normalizedOutput, evidence_refs: clone(outcome.evidence_refs ?? outcome.evidenceRefs ?? []), rationale: outcome.rationale || null, recorded_at: this._now() });
      state.checkpoint.council_ref = councilRef;
      if (normalizedOutput === "RESOLVED") {
        blocker.status = "resolved";
        task.blocker_ref = null;
        task.status = "queued";
        state.checkpoint.status = "running";
        state.checkpoint.phase = "execution";
        state.checkpoint.waiting_for = null;
        state.checkpoint.next_action = { type: "dispatch_ready" };
      } else if (normalizedOutput === "REMEDIATION_PLAN") {
        blocker.status = "remediating";
        const proposedTasks = outcome.tasks || outcome.remediation?.tasks || [];
        for (let index = 0; index < proposedTasks.length; index += 1) {
          const candidate = normalizeTask({ ...proposedTasks[index], depends_on: proposedTasks[index].depends_on || [task.task_id] }, { index, clock: this.clock });
          if (!state.tasks.tasks.some((existing) => existing.task_id === candidate.task_id)) state.tasks.tasks.push(candidate);
        }
        state.checkpoint.status = "running";
        state.checkpoint.phase = "execution";
        state.checkpoint.waiting_for = null;
        state.checkpoint.next_action = { type: "dispatch_remediation", blocker_id: blockerId };
      } else if (normalizedOutput === "WAITING_CONDITION") {
        blocker.status = "waiting";
        blocker.condition = requireText(outcome.condition, "council.condition");
        blocker.watch_ref = requireText(outcome.watch_ref ?? outcome.watchRef, "council.watch_ref");
        task.status = "waiting";
        state.checkpoint.phase = "recovery";
        state.checkpoint.status = hasIndependentWork(state.tasks.tasks, task.task_id) ? "running" : "waiting";
        state.checkpoint.waiting_for = { type: "council", condition: blocker.condition, watch_ref: blocker.watch_ref, recheck_at: outcome.recheck_at || outcome.recheckAt || null };
        state.checkpoint.next_action = { type: "recheck_condition", blocker_id: blockerId };
      } else if (normalizedOutput === "NEEDS_DECISION") {
        blocker.status = "decision_required";
        blocker.options = clone(outcome.options || []);
        task.status = "waiting";
        state.checkpoint.phase = "recovery";
        state.checkpoint.status = hasIndependentWork(state.tasks.tasks, task.task_id) ? "running" : "waiting";
        state.checkpoint.waiting_for = { type: "decision", condition: "decision_recorded", watch_ref: "maestro-authority", recheck_at: null };
        state.checkpoint.next_action = { type: "prepare_decision", blocker_id: blockerId };
      } else {
        blocker.status = "open";
        blocker.rationale = outcome.rationale || null;
        task.status = "waiting";
        state.checkpoint.phase = "recovery";
        state.checkpoint.status = hasIndependentWork(state.tasks.tasks, task.task_id) ? "running" : "waiting";
        state.checkpoint.waiting_for = state.checkpoint.status === "waiting" ? { type: "recovery", condition: "new_hypothesis_or_resource_available", watch_ref: "autopilot-supervisor", recheck_at: outcome.recheck_at || null } : null;
        state.checkpoint.next_action = { type: "choose_continuation", blocker_id: blockerId };
      }
      return { changed: ["tasks", "validation"], value: { council_ref: councilRef, output: normalizedOutput, blocker_id: blockerId } };
    });
    if (this.supervisor && normalizedOutput === "WAITING_CONDITION") {
      const state = await this.artifacts.readAll();
      const blocker = state.tasks.blockers.find((candidate) => candidate.blocker_id === blockerId);
      await this.supervisor.register({
        projectId: this.projectId,
        projectRoot: this.projectRoot,
        runId: state.checkpoint.run_id,
        taskId: blocker?.task_id,
        blockerId,
        condition: outcome.condition,
        watchRef: outcome.watch_ref ?? outcome.watchRef,
        recheckAt: outcome.recheck_at ?? outcome.recheckAt ?? null
      });
    }
    return result.result;
  }

  async recoverBlocker(blockerId) {
    return this._enqueue(async () => {
      const current = await this.artifacts.readAll();
      if (!current) throw errorWithCode("AUTOPILOT_NOT_INITIALIZED", "Autopilot mission artifacts do not exist; start a mission first.");
      const blocker = current.tasks.blockers.find((candidate) => candidate.blocker_id === blockerId);
      if (!blocker) throw errorWithCode("BLOCKER_NOT_FOUND", `blocker not found: ${blockerId}`);
      const task = current.tasks.tasks.find((candidate) => candidate.task_id === blocker.task_id);
      const eventKey = typeof blocker.event_ref === "string" ? blocker.event_ref.split(":") : [];
      const event = current.validation.events.find((candidate) => candidate.source === eventKey[0] && candidate.event_id === eventKey.slice(1).join(":")) || null;
      const outcome = await this._consultCouncil({ blocker: clone(blocker), task: clone(task), event: clone(event), mission: clone(current.checkpoint) });
      await this._applyCouncilOutcomeInternal(outcome, blockerId);
      return outcome;
    });
  }

  async reconcileCondition(watch = {}) {
    return this._enqueue(async () => {
      const result = await this._mutate((state) => {
        if (watch.resourceRef) {
          for (const task of state.tasks.tasks) {
            if (task.status === "waiting" && task.resource_refs.includes(watch.resourceRef)) task.status = "queued";
          }
        }
        state.checkpoint.status = "running";
        state.checkpoint.phase = "execution";
        state.checkpoint.waiting_for = null;
        state.checkpoint.next_action = { type: "dispatch_ready" };
        return { changed: ["tasks"], value: state.checkpoint };
      });
      return this.statusFrom(result.state);
    });
  }

  async release() {
    return this._enqueue(async () => {
      this._stopLeaseHeartbeat();
      if (!this.lease) return null;
      const released = await this.leaseStore.releaseLease(this.lease);
      this.lease = null;
      return released;
    });
  }
}

module.exports = {
  ACTIVE_MISSION_STATUSES,
  AutopilotMissionController,
  MISSION_STATUSES,
  TASK_STATUSES,
  projectIdForPath
};
