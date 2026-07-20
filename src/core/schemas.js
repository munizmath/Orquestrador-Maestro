"use strict";

const { CLASSIFICATIONS } = require("./security.js");

const VALID_STATUSES = new Set(["pending", "blocked", "ready", "running", "succeeded", "failed", "cancelled", "retrying", "dead-letter"]);
const VALID_SEVERITIES = new Set(["info", "warning", "error", "critical"]);
const VALID_CLASSIFICATIONS = new Set(Object.values(CLASSIFICATIONS));
const VALID_QUERY_NAMES = new Set([
  "cockpit.overview.get",
  "cockpit.summary.get",
  "skills.routes.search",
  "validation.status.get",
  "runs.timeline.list",
  "runs.record.get",
  "audit.events.list",
  "insights.snapshot.get",
  "alerts.list",
  "integrations.capabilities.list",
  "connectors.list",
  "queue.tasks.list",
  "metrics.summary.get",
  "llm.providers.list",
  "adapters.live.list",
  "actions.list",
]);
const VALID_ROLES = new Set([
  "maestro.owner",
  "maestro.operator",
  "maestro.viewer",
  "service.validator",
  "service.panel",
]);
const VALID_AUTHZ_EFFECTS = new Set(["allow", "deny", "redact", "require_confirmation"]);
const VALID_ACTION_NAMES = new Set([
  "validation.run",
]);

function issue(path, message) {
  return { path, message };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, path, issues) {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "expected object"));
    return false;
  }
  return true;
}

function requireString(value, path, issues, options = {}) {
  if (typeof value !== "string" || (!options.allowEmpty && value.trim() === "")) {
    issues.push(issue(path, "expected non-empty string"));
    return false;
  }
  return true;
}

function requireNumber(value, path, issues) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    issues.push(issue(path, "expected number"));
    return false;
  }
  return true;
}

function requireSchemaVersion(value, path, issues) {
  if (value !== 1) {
    issues.push(issue(`${path}.schemaVersion`, "expected schemaVersion 1"));
  }
}

function requireNoGenericKeyNames(value, path, issues) {
  for (const key of Object.keys(value || {})) {
    if (key === "id" || key === "user" || key === "tenant" || key === "item") {
      issues.push(issue(`${path}.${key}`, "generic identifier names are not allowed in Next Experience contracts"));
    }
  }
}

function requireArray(value, path, issues) {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "expected array"));
    return false;
  }
  return true;
}

function requireClassification(value, path, issues) {
  if (!VALID_CLASSIFICATIONS.has(value)) {
    issues.push(issue(path, `expected classification: ${Array.from(VALID_CLASSIFICATIONS).join(", ")}`));
  }
}

function validateOperationalIssue(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  if (!VALID_SEVERITIES.has(value.severity)) issues.push(issue(`${path}.severity`, "expected valid severity"));
  requireString(value.category, `${path}.category`, issues);
  requireString(value.code, `${path}.code`, issues);
  requireString(value.message, `${path}.message`, issues);
  if (value.file !== undefined && value.file !== null) requireString(value.file, `${path}.file`, issues);
  if (value.line !== undefined && value.line !== null) requireNumber(value.line, `${path}.line`, issues);
  if (value.snippet !== undefined && value.snippet !== null) requireString(value.snippet, `${path}.snippet`, issues);
  if (value.recommendation !== undefined && value.recommendation !== null) requireString(value.recommendation, `${path}.recommendation`, issues);
  return issues;
}

function validateValidationResult(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  if (typeof value.ok !== "boolean") issues.push(issue(`${path}.ok`, "expected boolean"));
  requireString(value.validator, `${path}.validator`, issues);
  if (requireArray(value.issues, `${path}.issues`, issues)) {
    value.issues.forEach((item, index) => issues.push(...validateOperationalIssue(item, `${path}.issues[${index}]`)));
  }
  return issues;
}

function validateRunRecord(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireString(value.id, `${path}.id`, issues);
  requireString(value.kind, `${path}.kind`, issues);
  if (!VALID_STATUSES.has(value.status)) issues.push(issue(`${path}.status`, "expected valid status"));
  requireString(value.startedAt, `${path}.startedAt`, issues);
  if (value.completedAt !== null && value.completedAt !== undefined) requireString(value.completedAt, `${path}.completedAt`, issues);
  if (value.durationMs !== null && value.durationMs !== undefined) requireNumber(value.durationMs, `${path}.durationMs`, issues);
  requireString(value.source, `${path}.source`, issues);
  requireString(value.summary, `${path}.summary`, issues);
  if (value.command !== undefined && value.command !== null) requireString(value.command, `${path}.command`, issues);
  if (requireArray(value.issues || [], `${path}.issues`, issues)) {
    (value.issues || []).forEach((item, index) => issues.push(...validateOperationalIssue(item, `${path}.issues[${index}]`)));
  }
  return issues;
}

function validateSkillRouteResult(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireString(value.promptHash, `${path}.promptHash`, issues);
  if (requireArray(value.skills, `${path}.skills`, issues)) {
    value.skills.forEach((skill, index) => {
      if (!isPlainObject(skill)) {
        issues.push(issue(`${path}.skills[${index}]`, "expected object"));
        return;
      }
      requireString(skill.name, `${path}.skills[${index}].name`, issues);
      requireNumber(skill.score, `${path}.skills[${index}].score`, issues);
      requireString(skill.reason, `${path}.skills[${index}].reason`, issues);
    });
  }
  return issues;
}

function validateConnectorDescriptor(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireString(value.id, `${path}.id`, issues);
  requireString(value.type, `${path}.type`, issues);
  if (requireArray(value.capabilities, `${path}.capabilities`, issues)) {
    value.capabilities.forEach((capability, index) => requireString(capability, `${path}.capabilities[${index}]`, issues));
  }
  if (!isPlainObject(value.permissions)) issues.push(issue(`${path}.permissions`, "expected permissions object"));
  return issues;
}

function validateProviderDescriptor(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireString(value.id, `${path}.id`, issues);
  requireString(value.kind, `${path}.kind`, issues);
  if (requireArray(value.capabilities, `${path}.capabilities`, issues)) {
    value.capabilities.forEach((capability, index) => requireString(capability, `${path}.capabilities[${index}]`, issues));
  }
  return issues;
}

function validateIntegrationIntent(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireString(value.id, `${path}.id`, issues);
  requireString(value.action, `${path}.action`, issues);
  requireString(value.target, `${path}.target`, issues);
  requireClassification(value.classification, `${path}.classification`, issues);
  if (!isPlainObject(value.payload)) issues.push(issue(`${path}.payload`, "expected payload object"));
  return issues;
}

function validateDryRunResult(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  if (typeof value.wouldExecute !== "boolean") issues.push(issue(`${path}.wouldExecute`, "expected boolean"));
  requireString(value.action, `${path}.action`, issues);
  requireString(value.target, `${path}.target`, issues);
  requireClassification(value.classification, `${path}.classification`, issues);
  if (requireArray(value.requiredConfirmations || [], `${path}.requiredConfirmations`, issues)) {
    (value.requiredConfirmations || []).forEach((item, index) => requireString(item, `${path}.requiredConfirmations[${index}]`, issues));
  }
  return issues;
}

function validateAuditEvent(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireString(value.eventId, `${path}.eventId`, issues);
  requireString(value.type, `${path}.type`, issues);
  requireString(value.timestamp, `${path}.timestamp`, issues);
  requireString(value.source, `${path}.source`, issues);
  requireString(value.safeSummary, `${path}.safeSummary`, issues);
  requireClassification(value.classification, `${path}.classification`, issues);
  if (Object.prototype.hasOwnProperty.call(value, "rawPayload")) issues.push(issue(`${path}.rawPayload`, "rawPayload is not allowed"));
  return issues;
}

function validateTask(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireString(value.taskId, `${path}.taskId`, issues);
  requireString(value.kind, `${path}.kind`, issues);
  if (!VALID_STATUSES.has(value.status)) issues.push(issue(`${path}.status`, "expected valid status"));
  requireString(value.createdAt, `${path}.createdAt`, issues);
  requireString(value.updatedAt, `${path}.updatedAt`, issues);
  if (value.idempotencyKey !== undefined && value.idempotencyKey !== null) requireString(value.idempotencyKey, `${path}.idempotencyKey`, issues);
  return issues;
}

function validateActorContext(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireNoGenericKeyNames(value, path, issues);
  requireString(value.actorKey, `${path}.actorKey`, issues);
  if (requireArray(value.roles, `${path}.roles`, issues)) {
    value.roles.forEach((role, index) => {
      requireString(role, `${path}.roles[${index}]`, issues);
      if (!VALID_ROLES.has(role)) issues.push(issue(`${path}.roles[${index}]`, "expected known role"));
    });
  }
  if (value.sessionKey !== undefined && value.sessionKey !== null) requireString(value.sessionKey, `${path}.sessionKey`, issues);
  return issues;
}

function validateTenantScope(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireNoGenericKeyNames(value, path, issues);
  requireString(value.workspaceKey, `${path}.workspaceKey`, issues);
  requireString(value.projectKey, `${path}.projectKey`, issues);
  requireString(value.projectRootRef, `${path}.projectRootRef`, issues);
  if (value.mode !== "local-only") issues.push(issue(`${path}.mode`, "expected local-only"));
  return issues;
}

function validateQueryEnvelope(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireNoGenericKeyNames(value, path, issues);
  requireString(value.queryName, `${path}.queryName`, issues);
  if (!VALID_QUERY_NAMES.has(value.queryName)) issues.push(issue(`${path}.queryName`, "query is not registered"));
  requireString(value.workspaceKey, `${path}.workspaceKey`, issues);
  requireString(value.projectKey, `${path}.projectKey`, issues);
  requireString(value.actorKey, `${path}.actorKey`, issues);
  requireString(value.purpose, `${path}.purpose`, issues);
  if (!isPlainObject(value.filters)) issues.push(issue(`${path}.filters`, "expected filters object"));
  if (!isPlainObject(value.pagination)) issues.push(issue(`${path}.pagination`, "expected pagination object"));
  if (value.pagination) {
    if (typeof value.pagination.limit !== "number" || value.pagination.limit < 1 || value.pagination.limit > 100) {
      issues.push(issue(`${path}.pagination.limit`, "expected number between 1 and 100"));
    }
    if (typeof value.pagination.offset !== "number" || value.pagination.offset < 0) {
      issues.push(issue(`${path}.pagination.offset`, "expected non-negative number"));
    }
  }
  if (requireArray(value.fields, `${path}.fields`, issues)) {
    if (value.fields.length === 0) issues.push(issue(`${path}.fields`, "expected at least one projected field"));
    value.fields.forEach((field, index) => requireString(field, `${path}.fields[${index}]`, issues));
  }
  return issues;
}

function validateAuthorizationDecision(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireNoGenericKeyNames(value, path, issues);
  requireString(value.decisionKey, `${path}.decisionKey`, issues);
  if (!VALID_AUTHZ_EFFECTS.has(value.effect)) issues.push(issue(`${path}.effect`, "expected valid authorization effect"));
  requireString(value.reasonCode, `${path}.reasonCode`, issues);
  requireString(value.safeSummary, `${path}.safeSummary`, issues);
  if (requireArray(value.requiredRoles || [], `${path}.requiredRoles`, issues)) {
    (value.requiredRoles || []).forEach((role, index) => requireString(role, `${path}.requiredRoles[${index}]`, issues));
  }
  return issues;
}

function validatePolicyDenial(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireNoGenericKeyNames(value, path, issues);
  requireString(value.denialKey, `${path}.denialKey`, issues);
  requireString(value.reasonCode, `${path}.reasonCode`, issues);
  requireString(value.safeSummary, `${path}.safeSummary`, issues);
  if (value.httpStatus !== 400 && value.httpStatus !== 401 && value.httpStatus !== 403 && value.httpStatus !== 404) {
    issues.push(issue(`${path}.httpStatus`, "expected fail-closed HTTP status"));
  }
  return issues;
}

function validatePanelViewModelEnvelope(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireNoGenericKeyNames(value, path, issues);
  if (typeof value.ok !== "boolean") issues.push(issue(`${path}.ok`, "expected boolean"));
  requireString(value.queryName, `${path}.queryName`, issues);
  requireString(value.workspaceKey, `${path}.workspaceKey`, issues);
  requireString(value.projectKey, `${path}.projectKey`, issues);
  if (!isPlainObject(value.data) && value.data !== null) issues.push(issue(`${path}.data`, "expected object or null"));
  if (requireArray(value.issues || [], `${path}.issues`, issues)) {
    (value.issues || []).forEach((item, index) => issues.push(...validateOperationalIssue(item, `${path}.issues[${index}]`)));
  }
  if (requireArray(value.warnings || [], `${path}.warnings`, issues)) {
    (value.warnings || []).forEach((item, index) => issues.push(...validateOperationalIssue(item, `${path}.warnings[${index}]`)));
  }
  return issues;
}

function validateActionEnvelope(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireNoGenericKeyNames(value, path, issues);
  requireString(value.actionName, `${path}.actionName`, issues);
  if (!VALID_ACTION_NAMES.has(value.actionName)) issues.push(issue(`${path}.actionName`, "action is not registered"));
  requireString(value.workspaceKey, `${path}.workspaceKey`, issues);
  requireString(value.projectKey, `${path}.projectKey`, issues);
  requireString(value.actorKey, `${path}.actorKey`, issues);
  requireString(value.idempotencyKey, `${path}.idempotencyKey`, issues);
  requireString(value.purpose, `${path}.purpose`, issues);
  if (!isPlainObject(value.payload)) issues.push(issue(`${path}.payload`, "expected payload object"));
  if (value.dryRunKey !== undefined && value.dryRunKey !== null) requireString(value.dryRunKey, `${path}.dryRunKey`, issues);
  if (value.confirmationKey !== undefined && value.confirmationKey !== null) requireString(value.confirmationKey, `${path}.confirmationKey`, issues);
  return issues;
}

function validateActionResult(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  requireSchemaVersion(value.schemaVersion, path, issues);
  requireNoGenericKeyNames(value, path, issues);
  if (typeof value.ok !== "boolean") issues.push(issue(`${path}.ok`, "expected boolean"));
  requireString(value.actionName, `${path}.actionName`, issues);
  requireString(value.workspaceKey, `${path}.workspaceKey`, issues);
  requireString(value.projectKey, `${path}.projectKey`, issues);
  if (!isPlainObject(value.data) && value.data !== null) issues.push(issue(`${path}.data`, "expected object or null"));
  if (requireArray(value.issues || [], `${path}.issues`, issues)) {
    (value.issues || []).forEach((item, index) => issues.push(...validateOperationalIssue(item, `${path}.issues[${index}]`)));
  }
  if (requireArray(value.warnings || [], `${path}.warnings`, issues)) {
    (value.warnings || []).forEach((item, index) => issues.push(...validateOperationalIssue(item, `${path}.warnings[${index}]`)));
  }
  return issues;
}

const validators = {
  OperationalIssue: validateOperationalIssue,
  ValidationResult: validateValidationResult,
  RunRecord: validateRunRecord,
  SkillRouteResult: validateSkillRouteResult,
  ConnectorDescriptor: validateConnectorDescriptor,
  ProviderDescriptor: validateProviderDescriptor,
  IntegrationIntent: validateIntegrationIntent,
  DryRunResult: validateDryRunResult,
  AuditEvent: validateAuditEvent,
  Task: validateTask,
  ActorContext: validateActorContext,
  TenantScope: validateTenantScope,
  QueryEnvelope: validateQueryEnvelope,
  AuthorizationDecision: validateAuthorizationDecision,
  PolicyDenial: validatePolicyDenial,
  PanelViewModelEnvelope: validatePanelViewModelEnvelope,
  ActionEnvelope: validateActionEnvelope,
  ActionResult: validateActionResult,
};

function validateSchema(name, value) {
  const validator = validators[name];
  if (!validator) throw new Error(`Schema desconhecido: ${name}`);
  const issues = validator(value);
  return { ok: issues.length === 0, issues };
}

function assertSchema(name, value) {
  const result = validateSchema(name, value);
  if (!result.ok) {
    const message = result.issues.map((item) => `${item.path}: ${item.message}`).join("; ");
    throw new Error(`${name} invalido: ${message}`);
  }
  return value;
}

module.exports = {
  validateSchema,
  assertSchema,
  validators,
};
