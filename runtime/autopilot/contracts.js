"use strict";

const crypto = require("node:crypto");

const MISSION_STATUSES = Object.freeze(["queued", "running", "waiting", "paused", "completed", "failed", "cancelled"]);
const TASK_STATUSES = Object.freeze(["queued", "running", "waiting", "paused", "completed", "failed", "cancelled"]);
const COUNCIL_OUTPUTS = Object.freeze(["RESOLVED", "REMEDIATION_PLAN", "WAITING_CONDITION", "NEEDS_DECISION", "UNRESOLVED"]);
const EXECUTION_EVENTS = Object.freeze([
  "execution.accepted",
  "execution.started",
  "execution.progress",
  "execution.completed",
  "execution.failed",
  "execution.cancelled",
  "resource.changed"
]);
const TERMINAL_TASK_STATUSES = new Set(["completed", "failed", "cancelled"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function timestamp(clock = () => new Date()) {
  const value = typeof clock === "function" ? clock() : new Date();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function optionalText(value, name) {
  if (value === undefined || value === null) return null;
  return requireText(value, name);
}

function arrayOfText(value, name) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value.map((item) => requireText(item, `${name} item`));
}

function normalizeResourcePolicy(value = {}) {
  const policy = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const min = policy.min_agents ?? policy.minAgents ?? 1;
  const preferred = policy.preferred_agents ?? policy.preferredAgents ?? min;
  const max = policy.max_agents ?? policy.maxAgents ?? preferred;
  for (const [name, number] of [["min_agents", min], ["preferred_agents", preferred], ["max_agents", max]]) {
    if (!Number.isInteger(number) || number < 1) throw new TypeError(`${name} must be a positive integer`);
  }
  if (min > preferred || preferred > max) throw new TypeError("resource policy requires min_agents <= preferred_agents <= max_agents");
  return {
    min_agents: min,
    preferred_agents: preferred,
    max_agents: max,
    allow_serial_fallback: policy.allow_serial_fallback ?? policy.allowSerialFallback ?? true,
    pool_ids: arrayOfText(policy.pool_ids ?? policy.poolIds, "resource_policy.pool_ids")
  };
}

function normalizeTask(input = {}, { index = 0, clock = Date } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("task must be an object");
  const taskId = input.task_id ?? input.taskId ?? id("TASK");
  const laneId = input.lane_id ?? input.laneId ?? `LANE-${index + 1}`;
  const status = input.status || "queued";
  if (!TASK_STATUSES.includes(status)) throw new TypeError(`unknown task status: ${status}`);
  return {
    task_id: requireText(taskId, "task.task_id"),
    lane_id: requireText(laneId, "task.lane_id"),
    description: requireText(input.description, "task.description"),
    capabilities_required: arrayOfText(input.capabilities_required ?? input.capabilitiesRequired, "task.capabilities_required"),
    depends_on: arrayOfText(input.depends_on ?? input.dependsOn, "task.depends_on"),
    owner: optionalText(input.owner, "task.owner"),
    write_scope: arrayOfText(input.write_scope ?? input.writeScope, "task.write_scope"),
    resource_refs: arrayOfText(input.resource_refs ?? input.resourceRefs, "task.resource_refs"),
    status,
    attempt_id: optionalText(input.attempt_id ?? input.attemptId, "task.attempt_id"),
    operation_id: optionalText(input.operation_id ?? input.operationId, "task.operation_id"),
    allocation_ref: optionalText(input.allocation_ref ?? input.allocationRef, "task.allocation_ref"),
    result_refs: arrayOfText(input.result_refs ?? input.resultRefs, "task.result_refs"),
    verification_refs: arrayOfText(input.verification_refs ?? input.verificationRefs, "task.verification_refs"),
    blocker_ref: optionalText(input.blocker_ref ?? input.blockerRef, "task.blocker_ref"),
    parallel_safe: input.parallel_safe ?? input.parallelSafe ?? false,
    created_at: input.created_at || input.createdAt || timestamp(clock),
    updated_at: input.updated_at || input.updatedAt || timestamp(clock)
  };
}

function validateCouncilOutput(value) {
  const output = requireText(value, "council.output").toUpperCase();
  if (!COUNCIL_OUTPUTS.includes(output)) throw new TypeError(`unknown council output: ${output}`);
  return output;
}

function validateExecutionEvent(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("execution event must be an object");
  const type = requireText(input.event_type ?? input.eventType ?? input.type, "event.event_type");
  if (!EXECUTION_EVENTS.includes(type)) throw new TypeError(`unknown execution event: ${type}`);
  const eventId = input.event_id ?? input.eventId ?? input.id;
  const source = input.source || "internal";
  return {
    schema_version: input.schema_version ?? input.schemaVersion ?? 1,
    event_id: requireText(eventId, "event.event_id"),
    source: requireText(source, "event.source"),
    event_type: type,
    project_id: requireText(input.project_id ?? input.projectId, "event.project_id"),
    run_id: requireText(input.run_id ?? input.runId, "event.run_id"),
    task_id: optionalText(input.task_id ?? input.taskId, "event.task_id"),
    attempt_id: optionalText(input.attempt_id ?? input.attemptId, "event.attempt_id"),
    session_id: optionalText(input.session_id ?? input.sessionId, "event.session_id"),
    sequence: Number.isInteger(input.sequence) && input.sequence >= 0 ? input.sequence : null,
    occurred_at: input.occurred_at || input.occurredAt || new Date().toISOString(),
    lease_ref: optionalText(input.lease_ref ?? input.leaseRef, "event.lease_ref"),
    lease_epoch: Number.isInteger(input.lease_epoch ?? input.leaseEpoch) ? (input.lease_epoch ?? input.leaseEpoch) : null,
    result_ref: optionalText(input.result_ref ?? input.resultRef, "event.result_ref"),
    evidence_refs: arrayOfText(input.evidence_refs ?? input.evidenceRefs, "event.evidence_refs"),
    resource_ref: optionalText(input.resource_ref ?? input.resourceRef, "event.resource_ref"),
    reason: optionalText(input.reason, "event.reason"),
    metadata: input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? clone(input.metadata) : {}
  };
}

module.exports = {
  COUNCIL_OUTPUTS,
  EXECUTION_EVENTS,
  MISSION_STATUSES,
  TASK_STATUSES,
  TERMINAL_TASK_STATUSES,
  arrayOfText,
  clone,
  id,
  normalizeResourcePolicy,
  normalizeTask,
  optionalText,
  requireText,
  timestamp,
  validateCouncilOutput,
  validateExecutionEvent
};
