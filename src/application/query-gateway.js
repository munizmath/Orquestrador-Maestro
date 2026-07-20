"use strict";

const { assertSchema, validateSchema } = require("../core/schemas.js");
const { CLASSIFICATIONS } = require("../core/security.js");
const { appendAuditEvent } = require("./audit-log.js");
const { authorizeQuery, buildActorContext } = require("./rbac-service.js");
const { resolveTenantScope } = require("./tenant-scope-service.js");
const {
  buildAlertsViewModel,
  buildInsightsViewModel,
  buildRunsViewModel,
  buildSkillsViewModel,
  buildStatusViewModel,
} = require("./view-models.js");
const { getRun } = require("./run-registry.js");
const { readAuditEvents } = require("./audit-log.js");
const { listCapabilities } = require("./integration-service.js");
const { listConnectors } = require("./connector-service.js");
const { listDeadLetters, listTasks } = require("./queue-service.js");
const { buildMetrics } = require("./metrics-service.js");
const { checkProviders, listProviders } = require("./llm-service.js");
const { listLiveAdapters } = require("./live-adapters.js");
const { listActions } = require("./action-service.js");

function issue(severity, category, code, message, recommendation = null) {
  return { schemaVersion: 1, severity, category, code, message, recommendation };
}

function denyEnvelope(queryEnvelope, denial, issues) {
  return assertSchema("PanelViewModelEnvelope", {
    schemaVersion: 1,
    ok: false,
    queryName: queryEnvelope.queryName || "unknown",
    workspaceKey: queryEnvelope.workspaceKey || "unknown",
    projectKey: queryEnvelope.projectKey || "unknown",
    data: { denial },
    issues,
    warnings: [],
  });
}

function allowEnvelope(queryEnvelope, data, warnings = []) {
  return assertSchema("PanelViewModelEnvelope", {
    schemaVersion: 1,
    ok: true,
    queryName: queryEnvelope.queryName,
    workspaceKey: queryEnvelope.workspaceKey,
    projectKey: queryEnvelope.projectKey,
    data,
    issues: [],
    warnings,
  });
}

function policyDenial(queryEnvelope, reasonCode, safeSummary, httpStatus = 403) {
  return assertSchema("PolicyDenial", {
    schemaVersion: 1,
    denialKey: `denial_${reasonCode}_${String(queryEnvelope.queryName || "unknown").replace(/[^a-z0-9_.-]/gi, "_")}`,
    reasonCode,
    safeSummary,
    httpStatus,
  });
}

function audit(store, input) {
  if (!store) return null;
  return appendAuditEvent(store, {
    type: input.type,
    source: "query-gateway",
    status: input.status || "succeeded",
    safeSummary: input.safeSummary,
    classification: input.classification || CLASSIFICATIONS.AUDIT_SAFE,
    details: input.details || {},
  });
}

function sanitizeQuery(input = {}) {
  return {
    schemaVersion: input.schemaVersion,
    queryName: input.queryName,
    workspaceKey: input.workspaceKey,
    projectKey: input.projectKey,
    actorKey: input.actorKey,
    filters: input.filters || {},
    pagination: input.pagination || { limit: 25, offset: 0 },
    fields: input.fields || ["summary"],
    purpose: input.purpose,
  };
}

function paginate(items, pagination) {
  const offset = pagination.offset || 0;
  const limit = pagination.limit || 25;
  return items.slice(offset, offset + limit);
}

function projectFields(source, fields) {
  if (fields.includes("*")) return source;
  return fields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) acc[field] = source[field];
    return acc;
  }, {});
}

function mapTask(task) {
  return {
    taskKey: task.taskId,
    type: task.type,
    kind: task.kind,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    attempts: task.attempts,
    runKey: task.runId,
    lastError: task.lastError,
  };
}

function createQueryGateway({ repoRoot, store }) {
  const handlers = {
    "cockpit.overview.get": () => {
      const status = buildStatusViewModel(repoRoot, { store });
      const tasks = listTasks(store);
      const deadLetters = listDeadLetters(store);
      const metrics = buildMetrics(store);
      const audit = readAuditEvents(store).slice(-25).reverse();
      const adapters = listLiveAdapters().map((adapter) => adapter.execute());
      return {
        schemaVersion: 1,
        status,
        readiness: {
          adapters,
          ready: adapters.filter((adapter) => adapter.ok).length,
          blocked: adapters.filter((adapter) => !adapter.ok).length,
        },
        queue: {
          total: tasks.length,
          pending: tasks.filter((task) => task.status === "pending").length,
          running: tasks.filter((task) => task.status === "running").length,
          failed: tasks.filter((task) => task.status === "failed").length,
          deadLetter: deadLetters.length,
          tasks: tasks.slice(0, 25).map(mapTask),
        },
        metrics,
        audit: {
          total: metrics.audit.total,
          recent: audit.map((event) => ({
            auditEventKey: event.eventId || event.auditEventKey,
            type: event.type,
            status: event.status,
            timestamp: event.timestamp,
            safeSummary: event.safeSummary,
          })),
        },
      };
    },
    "cockpit.summary.get": (query) => buildStatusViewModel(repoRoot, { store }),
    "skills.routes.search": (query) => {
      const view = buildSkillsViewModel(repoRoot);
      const search = String(query.filters.search || "").toLowerCase();
      const skills = search
        ? view.skills.filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(search))
        : view.skills;
      return { ...view, skills: paginate(skills, query.pagination), count: skills.length };
    },
    "validation.status.get": () => {
      const status = buildStatusViewModel(repoRoot, { store });
      return { schemaVersion: 1, ok: status.ok, health: status.health, issues: status.issues, warnings: status.warnings };
    },
    "runs.timeline.list": (query) => {
      const view = buildRunsViewModel(store);
      return {
        ...view,
        recent: paginate(view.recent, query.pagination).map((run) => ({
          runKey: run.id,
          kind: run.kind,
          status: run.status,
          startedAt: run.startedAt,
          durationMs: run.durationMs,
          summary: run.summary,
        })),
        count: view.count,
      };
    },
    "runs.record.get": (query) => {
      const runKey = query.filters.runKey;
      if (!runKey) {
        return { schemaVersion: 1, run: null, issues: [issue("error", "runs", "run_key_required", "runKey is required.")] };
      }
      const run = getRun(store, runKey);
      return {
        schemaVersion: 1,
        run: run ? {
          runKey: run.id,
          kind: run.kind,
          status: run.status,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          durationMs: run.durationMs,
          source: run.source,
          summary: run.summary,
          issues: run.issues || [],
          artifacts: run.artifacts || [],
        } : null,
      };
    },
    "audit.events.list": (query) => {
      const events = readAuditEvents(store).slice().reverse();
      return {
        schemaVersion: 1,
        events: paginate(events, query.pagination).map((event) => ({
          auditEventKey: event.eventId || event.auditEventKey,
          type: event.type,
          timestamp: event.timestamp,
          source: event.source,
          status: event.status,
          safeSummary: event.safeSummary,
          classification: event.classification,
        })),
        count: events.length,
      };
    },
    "insights.snapshot.get": () => buildInsightsViewModel(repoRoot, { store }),
    "alerts.list": () => buildAlertsViewModel(buildStatusViewModel(repoRoot, { store })),
    "integrations.capabilities.list": () => ({
      schemaVersion: 1,
      capabilities: listCapabilities(),
    }),
    "connectors.list": () => ({
      schemaVersion: 1,
      connectors: listConnectors().map((connector) => ({
        connectorKey: connector.id,
        type: connector.type,
        mode: connector.mode,
        configured: connector.configured,
        healthy: connector.healthy,
        dryRunSupported: connector.dryRunSupported,
        liveDisabledByDefault: connector.liveDisabledByDefault,
        missingConfig: connector.missingConfig,
      })),
    }),
    "queue.tasks.list": (query) => {
      const tasks = listTasks(store);
      const deadLetters = listDeadLetters(store);
      return { schemaVersion: 1, tasks: paginate(tasks, query.pagination).map(mapTask), deadLetters: deadLetters.map(mapTask), count: tasks.length };
    },
    "metrics.summary.get": () => buildMetrics(store),
    "llm.providers.list": () => ({
      schemaVersion: 1,
      providers: listProviders().map((provider) => ({
        providerKey: provider.id,
        kind: provider.kind,
        name: provider.name,
        capabilities: provider.capabilities,
        mode: provider.mode || "local-dry-run",
        models: provider.models.map((model) => ({
          modelKey: model.id,
          contextWindow: model.contextWindow,
          costClass: model.costClass,
        })),
      })),
      checks: checkProviders().map((check) => ({
        providerKey: check.id,
        ok: check.ok,
        mode: check.mode,
        models: check.models,
        missingConfig: check.missingConfig,
      })),
    }),
    "adapters.live.list": () => ({
      schemaVersion: 1,
      adapters: listLiveAdapters().map((adapter) => {
        const status = adapter.execute();
        return {
          adapterKey: adapter.id,
          ok: status.ok,
          code: status.code,
          mode: status.mode,
        };
      }),
    }),
    "actions.list": () => ({
      schemaVersion: 1,
      actions: listActions().map((action) => ({
        actionKey: action.id,
        label: action.label,
        riskLevel: action.riskLevel,
        disabledInPanel: action.disabledInPanel,
      })),
    }),
  };

  function execute(input) {
    const query = sanitizeQuery(input.query || input);
    const schemaResult = validateSchema("QueryEnvelope", query);
    if (!schemaResult.ok) {
      const denial = policyDenial(query, "query_schema_invalid", "Query envelope failed schema validation.", 400);
      audit(store, { type: "query.denied", status: "blocked", safeSummary: denial.safeSummary, details: { reasonCode: denial.reasonCode, issues: schemaResult.issues } });
      return denyEnvelope(query, denial, schemaResult.issues.map((item) => issue("error", "query", "query_schema_invalid", `${item.path}: ${item.message}`)));
    }

    const actorResult = validateSchema("ActorContext", input.actorContext || {});
    if (!actorResult.ok) {
      const denial = policyDenial(query, "actor_context_invalid", "Actor context failed schema validation.", 401);
      audit(store, { type: "query.denied", status: "blocked", safeSummary: denial.safeSummary, details: { reasonCode: denial.reasonCode, issues: actorResult.issues } });
      return denyEnvelope(query, denial, actorResult.issues.map((item) => issue("error", "auth", "actor_context_invalid", `${item.path}: ${item.message}`)));
    }

    const actorContext = buildActorContext(input.actorContext);
    const decision = authorizeQuery(actorContext, query);
    if (decision.effect !== "allow") {
      const denial = policyDenial(query, decision.reasonCode, decision.safeSummary, 403);
      audit(store, { type: "policy.denied", status: "blocked", safeSummary: decision.safeSummary, details: { decision } });
      return denyEnvelope(query, denial, [issue("error", "authz", decision.reasonCode, decision.safeSummary)]);
    }

    const tenant = resolveTenantScope(repoRoot, query);
    if (!tenant.ok) {
      const denial = policyDenial(query, tenant.code, tenant.safeSummary, 403);
      audit(store, { type: "tenant_scope.denied", status: "blocked", safeSummary: tenant.safeSummary, details: { workspaceKey: query.workspaceKey, projectKey: query.projectKey } });
      return denyEnvelope(query, denial, [issue("error", "tenant-scope", tenant.code, tenant.safeSummary)]);
    }

    const handler = handlers[query.queryName];
    if (!handler) {
      const denial = policyDenial(query, "query_handler_missing", "Query handler is not registered.", 403);
      audit(store, { type: "query.denied", status: "blocked", safeSummary: denial.safeSummary, details: { queryName: query.queryName } });
      return denyEnvelope(query, denial, [issue("error", "query", "query_handler_missing", denial.safeSummary)]);
    }

    const data = projectFields(handler(query), query.fields);
    audit(store, {
      type: "query.executed",
      safeSummary: `Query executed: ${query.queryName}`,
      details: {
        queryName: query.queryName,
        workspaceKey: query.workspaceKey,
        projectKey: query.projectKey,
        actorKey: query.actorKey,
      },
    });
    return allowEnvelope(query, data);
  }

  return { execute };
}

module.exports = {
  createQueryGateway,
};
