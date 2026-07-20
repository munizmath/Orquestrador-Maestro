"use strict";

const { assertSchema, validateSchema } = require("../core/schemas.js");
const { CLASSIFICATIONS, hashText, redactValue } = require("../core/security.js");
const { appendAuditEvent } = require("./audit-log.js");
const { authorizeAction, buildActorContext } = require("./rbac-service.js");
const { resolveTenantScope } = require("./tenant-scope-service.js");
const { createRun, updateRun } = require("./run-registry.js");
const { validateProject } = require("./validation-service.js");

function issue(severity, category, code, message, recommendation = null) {
  return { schemaVersion: 1, severity, category, code, message, recommendation };
}

function actionKey(action) {
  return `dryrun_${hashText([
    action.actionName,
    action.workspaceKey,
    action.projectKey,
    action.actorKey,
    action.idempotencyKey,
  ].join("|"))}`;
}

function sanitizeAction(input = {}) {
  return {
    schemaVersion: input.schemaVersion,
    actionName: input.actionName,
    workspaceKey: input.workspaceKey,
    projectKey: input.projectKey,
    actorKey: input.actorKey,
    idempotencyKey: input.idempotencyKey,
    purpose: input.purpose,
    payload: input.payload || {},
    dryRunKey: input.dryRunKey || null,
    confirmationKey: input.confirmationKey || null,
  };
}

function audit(store, input) {
  if (!store) return null;
  return appendAuditEvent(store, {
    type: input.type,
    source: "action-gateway",
    status: input.status || "succeeded",
    safeSummary: input.safeSummary,
    classification: input.classification || CLASSIFICATIONS.AUDIT_SAFE,
    details: input.details || {},
  });
}

function result(action, ok, data, issues = [], warnings = []) {
  return assertSchema("ActionResult", {
    schemaVersion: 1,
    ok,
    actionName: action.actionName || "unknown",
    workspaceKey: action.workspaceKey || "unknown",
    projectKey: action.projectKey || "unknown",
    data,
    issues,
    warnings,
  });
}

function deny(action, reasonCode, safeSummary, httpStatus = 403) {
  return result(action, false, {
    denial: {
      schemaVersion: 1,
      denialKey: `denial_${reasonCode}_${String(action.actionName || "unknown").replace(/[^a-z0-9_.-]/gi, "_")}`,
      reasonCode,
      safeSummary,
      httpStatus,
    },
  }, [issue("error", "action", reasonCode, safeSummary)]);
}

function validateInput(action, actorContext, repoRoot, store) {
  const actionResult = validateSchema("ActionEnvelope", action);
  if (!actionResult.ok) {
    audit(store, { type: "action.failed", status: "blocked", safeSummary: "Action envelope failed schema validation.", details: { issues: actionResult.issues } });
    return deny(action, "action_schema_invalid", "Action envelope failed schema validation.", 400);
  }

  const actorResult = validateSchema("ActorContext", actorContext || {});
  if (!actorResult.ok) {
    audit(store, { type: "action.failed", status: "blocked", safeSummary: "Actor context failed schema validation.", details: { issues: actorResult.issues } });
    return deny(action, "actor_context_invalid", "Actor context failed schema validation.", 401);
  }

  const actor = buildActorContext(actorContext);
  const decision = authorizeAction(actor, action);
  if (decision.effect !== "allow") {
    audit(store, { type: "action.failed", status: "blocked", safeSummary: decision.safeSummary, details: { decision } });
    return deny(action, decision.reasonCode, decision.safeSummary, 403);
  }

  const tenant = resolveTenantScope(repoRoot, action);
  if (!tenant.ok) {
    audit(store, { type: "action.failed", status: "blocked", safeSummary: tenant.safeSummary, details: { workspaceKey: action.workspaceKey, projectKey: action.projectKey } });
    return deny(action, tenant.code, tenant.safeSummary, 403);
  }

  return null;
}

function createActionGateway({ repoRoot, store }) {
  function dryRun(input = {}) {
    const action = sanitizeAction(input.action || input);
    const blocked = validateInput(action, input.actorContext, repoRoot, store);
    if (blocked) return blocked;

    const dryRunKey = actionKey(action);
    audit(store, {
      type: "action.requested",
      safeSummary: `Dry-run requested: ${action.actionName}`,
      details: { actionName: action.actionName, actorKey: action.actorKey, dryRunKey },
    });
    audit(store, {
      type: "dry_run.generated",
      safeSummary: `Dry-run generated: ${action.actionName}`,
      details: { actionName: action.actionName, dryRunKey },
    });

    return result(action, true, {
      schemaVersion: 1,
      dryRun: {
        schemaVersion: 1,
        wouldExecute: true,
        action: action.actionName,
        target: action.projectKey,
        classification: CLASSIFICATIONS.AUDIT_SAFE,
        requiredConfirmations: [],
        dryRunKey,
        idempotencyKey: action.idempotencyKey,
        redactedPayload: redactValue(action.payload).value,
      },
    });
  }

  function execute(input = {}) {
    const action = sanitizeAction(input.action || input);
    const blocked = validateInput(action, input.actorContext, repoRoot, store);
    if (blocked) return blocked;

    const expectedDryRunKey = actionKey(action);
    if (action.dryRunKey !== expectedDryRunKey) {
      audit(store, {
        type: "action.failed",
        status: "blocked",
        safeSummary: "Action execution blocked because dry-run key is missing or invalid.",
        details: { actionName: action.actionName, actorKey: action.actorKey },
      });
      return deny(action, "dry_run_required", "Action execution requires a matching dry-run key.", 403);
    }

    if (action.actionName !== "validation.run") {
      return deny(action, "action_not_registered", "Action handler is not registered.", 403);
    }

    audit(store, {
      type: "action.started",
      safeSummary: `Action started: ${action.actionName}`,
      details: { actionName: action.actionName, actorKey: action.actorKey },
    });

    const run = createRun(store, {
      kind: "validation",
      command: "validate --check-sync",
      source: "action-gateway",
      summary: "Validation action started",
    });

    const validation = validateProject(repoRoot, {
      checkSync: Boolean(action.payload.checkSync !== false),
      includePackageCheck: Boolean(action.payload.includePackageCheck),
    });
    const finished = updateRun(store, run.id, {
      status: validation.ok ? "succeeded" : "failed",
      completedAt: new Date().toISOString(),
      summary: validation.ok ? "Validation action passed" : "Validation action failed",
      issues: validation.issues || [],
    });

    audit(store, {
      type: validation.ok ? "action.finished" : "action.failed",
      status: validation.ok ? "succeeded" : "failed",
      safeSummary: validation.ok ? "Validation action finished." : "Validation action failed.",
      details: { actionName: action.actionName, runKey: finished.id, issueCount: (validation.issues || []).length },
    });

    return result(action, validation.ok, {
      schemaVersion: 1,
      runKey: finished.id,
      validation,
    }, validation.ok ? [] : validation.issues || []);
  }

  return { dryRun, execute };
}

module.exports = {
  createActionGateway,
};
