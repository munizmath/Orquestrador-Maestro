"use strict";

const { CLASSIFICATIONS } = require("./security.js");

const VALID_STATUSES = new Set(["pending", "blocked", "ready", "running", "succeeded", "failed", "cancelled", "retrying"]);
const VALID_SEVERITIES = new Set(["info", "warning", "error", "critical"]);
const VALID_CLASSIFICATIONS = new Set(Object.values(CLASSIFICATIONS));

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
