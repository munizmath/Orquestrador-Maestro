"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { buildAlertsViewModel, buildRunsViewModel, buildStatusViewModel } = require("../../application/view-models.js");
const { createQueryGateway } = require("../../application/query-gateway.js");
const { createActionGateway } = require("../../application/action-gateway.js");
const { buildTenantScope } = require("../../application/tenant-scope-service.js");
const { createLocalStore } = require("../../infrastructure/local-store.js");
const { hashText } = require("../../core/security.js");
const { listCapabilities } = require("../../application/integration-service.js");
const { checkProviders, listProviders } = require("../../application/llm-service.js");
const { listConnectors } = require("../../application/connector-service.js");
const { listWorkflows } = require("../../application/workflow-service.js");
const { ALLOWED_TASKS, enqueueTask, listDeadLetters, listTasks } = require("../../application/queue-service.js");
const { buildMetrics } = require("../../application/metrics-service.js");
const { listLiveAdapters } = require("../../application/live-adapters.js");
const { explainConfig } = require("../../infrastructure/config-loader.js");
const { listActions } = require("../../application/action-service.js");
const { readAuditEvents } = require("../../application/audit-log.js");
const {
  buildSupportReport,
  buildWizardStatus,
  checkWizardLlm,
  checkWizardWhatsApp,
  dryRunWizardLlm,
  dryRunWizardWhatsApp,
  saveWizardSettings,
} = require("../../application/setup-service.js");

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-omx-session, x-omx-roles",
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function readActorContext(request, body) {
  const sessionKey = request.headers["x-omx-session"];
  if (!sessionKey) {
    return {
      ok: false,
      statusCode: 401,
      payload: {
        ok: false,
        error: "session_required",
        issues: [{ code: "session_required", message: "x-omx-session header is required." }],
      },
    };
  }
  const roles = String(request.headers["x-omx-roles"] || "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  return {
    ok: true,
    actorContext: {
      schemaVersion: 1,
      actorKey: body.actorKey || (body.query && body.query.actorKey) || (body.action && body.action.actorKey) || "",
      roles,
      sessionKey: String(sessionKey),
    },
  };
}

function sendFile(response, filePath, contentType) {
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(fs.readFileSync(filePath));
}

function redirect(response, location) {
  response.writeHead(302, {
    location,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end();
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".jsx": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
  };
  return map[ext] || "application/octet-stream";
}

function sendDesignFile(response, repoRoot, requestPath) {
  const designRoot = path.join(repoRoot, "docs", "design");
  const routeMap = {
    "/design": "Painel do Orquestrador.html",
    "/design/": "Painel do Orquestrador.html",
    "/design/painel": "Painel do Orquestrador.html",
    "/design/landing": "Orquestrador Maestro.html",
  };
  const relative = routeMap[requestPath] || decodeURIComponent(requestPath.slice("/design/".length));
  if (!relative || relative.includes("\0") || relative.endsWith(":Zone.Identifier")) {
    sendJson(response, 404, { ok: false, error: "not_found" });
    return;
  }
  const target = path.resolve(designRoot, relative);
  if (target !== designRoot && !target.startsWith(`${designRoot}${path.sep}`)) {
    sendJson(response, 403, { ok: false, error: "forbidden" });
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    sendJson(response, 404, { ok: false, error: "not_found" });
    return;
  }
  sendFile(response, target, contentTypeFor(target));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error("request_too_large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    request.on("error", reject);
  });
}

function inboundIdempotencyKey(body) {
  if (body.idempotencyKey) return String(body.idempotencyKey);
  const eventKey = body.eventId || body.eventKey || body.messageId || body.providerMessageId || "";
  const source = body.source || body.provider || "external";
  const type = body.type || body.taskType || body.eventType || "skill.route";
  return `inbound:${hashText([source, type, eventKey || JSON.stringify(body.payload || body)].join("|"))}`;
}

function findQueuedByIdempotency(store, idempotencyKey) {
  return [...listTasks(store), ...listDeadLetters(store)].find((task) => task.idempotencyKey === idempotencyKey) || null;
}

function enqueueInboundEvent(store, body = {}) {
  const taskType = body.taskType || body.type || (body.skillName || body.prompt || body.eventType ? "skill.route" : "validate");
  if (!ALLOWED_TASKS[taskType]) {
    return {
      ok: false,
      statusCode: 400,
      payload: { ok: false, error: "task_type_not_allowed", allowedTaskTypes: Object.keys(ALLOWED_TASKS) },
    };
  }
  const idempotencyKey = inboundIdempotencyKey(body);
  const existing = findQueuedByIdempotency(store, idempotencyKey);
  if (existing) {
    return {
      ok: true,
      statusCode: 200,
      payload: { ok: true, data: { schemaVersion: 1, deduped: true, task: existing } },
    };
  }
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const task = enqueueTask(store, {
    type: taskType,
    idempotencyKey,
    payload: {
      ...payload,
      source: body.source || payload.source || "webhook.inbound",
      eventType: body.eventType || payload.eventType || taskType,
      prompt: body.prompt || payload.prompt || body.skillName || payload.skillName || body.eventType || taskType,
    },
    retryPolicy: body.retryPolicy,
  });
  return {
    ok: true,
    statusCode: 202,
    payload: { ok: true, data: { schemaVersion: 1, deduped: false, task } },
  };
}

function sendSetupFile(response, panelRoot, fileName, contentType) {
  sendFile(response, path.join(panelRoot, fileName), contentType);
}

function localPanelActor() {
  return {
    schemaVersion: 1,
    actorKey: "actor_local_panel",
    roles: ["service.panel"],
    sessionKey: "session_local_panel",
  };
}

function localPanelQuery(scope, queryName, fields, overrides = {}) {
  return {
    schemaVersion: 1,
    queryName,
    workspaceKey: scope.workspaceKey,
    projectKey: scope.projectKey,
    actorKey: "actor_local_panel",
    filters: overrides.filters || {},
    pagination: overrides.pagination || { limit: 25, offset: 0 },
    fields,
    purpose: overrides.purpose || "panel.read",
  };
}

function createServer(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const store = options.store || createLocalStore({ repoRoot, rootDir: options.stateDir || undefined });
  const panelRoot = path.join(repoRoot, "src", "interfaces", "panel");
  const queryGateway = createQueryGateway({ repoRoot, store });
  const actionGateway = createActionGateway({ repoRoot, store });
  const tenantScope = buildTenantScope(repoRoot);

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const status = () => buildStatusViewModel(repoRoot, { store });

      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type, x-omx-session, x-omx-roles",
          "access-control-max-age": "600",
        });
        response.end();
        return;
      }

      if (request.method === "POST") {
        const body = await readJsonBody(request);
        if (url.pathname === "/query") {
          const actor = readActorContext(request, body);
          if (!actor.ok) {
            sendJson(response, actor.statusCode, actor.payload);
            return;
          }
          const result = queryGateway.execute({
            query: body.query || body,
            actorContext: body.actorContext || actor.actorContext,
          });
          const statusCode = result.ok ? 200 : (result.data && result.data.denial && result.data.denial.httpStatus) || 403;
          sendJson(response, statusCode, result);
          return;
        }
        if (url.pathname === "/action/dry-run" || url.pathname === "/action/execute") {
          const actor = readActorContext(request, body);
          if (!actor.ok) {
            sendJson(response, actor.statusCode, actor.payload);
            return;
          }
          const result = url.pathname === "/action/dry-run"
            ? actionGateway.dryRun({ action: body.action || body, actorContext: body.actorContext || actor.actorContext })
            : actionGateway.execute({ action: body.action || body, actorContext: body.actorContext || actor.actorContext });
          const statusCode = result.ok ? 200 : (result.data && result.data.denial && result.data.denial.httpStatus) || 403;
          sendJson(response, statusCode, result);
          return;
        }
        if (url.pathname === "/webhooks/inbound") {
          const result = enqueueInboundEvent(store, body);
          sendJson(response, result.statusCode, result.payload);
          return;
        }
        if (url.pathname === "/setup/config") {
          const data = saveWizardSettings(repoRoot, body);
          sendJson(response, data.ok ? 200 : 400, { ok: data.ok, data, error: data.ok ? null : data.code || "setup_config_failed" });
          return;
        }
        if (url.pathname === "/setup/whatsapp/check") {
          const data = checkWizardWhatsApp(repoRoot, body);
          sendJson(response, data.ok ? 200 : 400, { ok: data.ok, data, error: data.ok ? null : "whatsapp_not_configured" });
          return;
        }
        if (url.pathname === "/setup/whatsapp/dry-run") {
          const data = dryRunWizardWhatsApp(repoRoot, body);
          sendJson(response, data.ok ? 200 : 400, { ok: data.ok, data, error: data.ok ? null : data.code || "whatsapp_dry_run_blocked" });
          return;
        }
        if (url.pathname === "/setup/llm/check") {
          const data = checkWizardLlm(repoRoot, body);
          sendJson(response, data.ok ? 200 : 400, { ok: data.ok, data, error: data.ok ? null : "llm_not_configured" });
          return;
        }
        if (url.pathname === "/setup/llm/dry-run") {
          const data = dryRunWizardLlm(repoRoot, body);
          sendJson(response, data.ok ? 200 : 400, { ok: data.ok, data, error: data.ok ? null : data.code || "llm_dry_run_blocked" });
          return;
        }
        sendJson(response, 404, { ok: false, error: "not_found" });
        return;
      }

      if (request.method !== "GET") {
        sendJson(response, 405, { ok: false, error: "method_not_allowed" });
        return;
      }

      if (url.pathname === "/health" || url.pathname === "/status") {
        const result = queryGateway.execute({
          actorContext: localPanelActor(),
          query: localPanelQuery(tenantScope, "cockpit.summary.get", ["schemaVersion", "ok", "mode", "health", "issues", "warnings", "nextActions"]),
        });
        sendJson(response, result.ok ? 200 : 403, { ok: result.ok, data: result.data, issues: result.issues });
        return;
      }
      if (url.pathname === "/version") {
        sendJson(response, 200, { ok: true, data: { schemaVersion: 1, name: "orquestrador-maestro-local-api" } });
        return;
      }
      if (url.pathname === "/skills") {
        const result = queryGateway.execute({
          actorContext: localPanelActor(),
          query: localPanelQuery(tenantScope, "skills.routes.search", ["schemaVersion", "count", "byRisk", "skills"], { pagination: { limit: 100, offset: 0 } }),
        });
        sendJson(response, result.ok ? 200 : 403, { ok: result.ok, data: result.data, issues: result.issues });
        return;
      }
      if (url.pathname === "/runs") {
        const result = queryGateway.execute({
          actorContext: localPanelActor(),
          query: localPanelQuery(tenantScope, "runs.timeline.list", ["schemaVersion", "count", "recent"]),
        });
        sendJson(response, result.ok ? 200 : 403, { ok: result.ok, data: result.data, issues: result.issues });
        return;
      }
      if (url.pathname.startsWith("/runs/")) {
        const runKey = decodeURIComponent(url.pathname.slice("/runs/".length));
        const result = queryGateway.execute({
          actorContext: localPanelActor(),
          query: localPanelQuery(tenantScope, "runs.record.get", ["schemaVersion", "run"], { filters: { runKey } }),
        });
        sendJson(response, result.ok && result.data.run ? 200 : 404, result.ok && result.data.run ? { ok: true, data: result.data } : { ok: false, error: "run_not_found", issues: result.issues });
        return;
      }
      if (url.pathname === "/alerts") {
        sendJson(response, 200, { ok: true, data: buildAlertsViewModel(status()) });
        return;
      }
      if (url.pathname === "/insights") {
        const result = queryGateway.execute({
          actorContext: localPanelActor(),
          query: localPanelQuery(tenantScope, "insights.snapshot.get", ["schemaVersion", "runs", "skills"]),
        });
        sendJson(response, result.ok ? 200 : 403, { ok: result.ok, data: result.data, issues: result.issues });
        return;
      }
      if (url.pathname === "/query/scope") {
        sendJson(response, 200, {
          ok: true,
          data: {
            schemaVersion: 1,
            scope: tenantScope,
            actorContext: localPanelActor(),
          },
        });
        return;
      }
      if (url.pathname === "/integrations") {
        sendJson(response, 200, { ok: true, data: { schemaVersion: 1, capabilities: listCapabilities() } });
        return;
      }
      if (url.pathname === "/connectors") {
        sendJson(response, 200, { ok: true, data: { schemaVersion: 1, connectors: listConnectors() } });
        return;
      }
      if (url.pathname === "/workflows") {
        sendJson(response, 200, { ok: true, data: { schemaVersion: 1, workflows: listWorkflows() } });
        return;
      }
      if (url.pathname === "/queue") {
        sendJson(response, 200, { ok: true, data: { schemaVersion: 1, tasks: listTasks(store), deadLetters: listDeadLetters(store) } });
        return;
      }
      if (url.pathname === "/metrics") {
        sendJson(response, 200, { ok: true, data: buildMetrics(store) });
        return;
      }
      if (url.pathname === "/adapters/live") {
        sendJson(response, 200, { ok: true, data: { schemaVersion: 1, adapters: listLiveAdapters().map((adapter) => adapter.execute()) } });
        return;
      }
      if (url.pathname === "/config") {
        sendJson(response, 200, { ok: true, data: explainConfig({ repoRoot }) });
        return;
      }
      if (url.pathname === "/setup/status") {
        sendJson(response, 200, { ok: true, data: buildWizardStatus(repoRoot, { cwd: repoRoot }) });
        return;
      }
      if (url.pathname === "/setup/report") {
        sendJson(response, 200, { ok: true, data: buildSupportReport(repoRoot, { cwd: repoRoot }) });
        return;
      }
      if (url.pathname === "/actions") {
        sendJson(response, 200, { ok: true, data: { schemaVersion: 1, actions: listActions() } });
        return;
      }
      if (url.pathname === "/overview") {
        const runs = buildRunsViewModel(store);
        const tasks = listTasks(store);
        const deadLetters = listDeadLetters(store);
        const metrics = buildMetrics(store);
        const audit = readAuditEvents(store).slice(-25).reverse();
        const adapters = listLiveAdapters().map((adapter) => adapter.execute());
        sendJson(response, 200, {
          ok: true,
          data: {
            schemaVersion: 1,
            status: status(),
            readiness: {
              adapters,
              ready: adapters.filter((adapter) => adapter.ok).length,
              blocked: adapters.filter((adapter) => !adapter.ok).length,
            },
            runs,
            queue: {
              total: tasks.length,
              pending: tasks.filter((task) => task.status === "pending").length,
              running: tasks.filter((task) => task.status === "running").length,
              failed: tasks.filter((task) => task.status === "failed").length,
              deadLetter: deadLetters.length,
              tasks: tasks.slice(0, 25),
            },
            metrics,
            audit: {
              total: metrics.audit.total,
              recent: audit.map((event) => ({
                id: event.id,
                type: event.type,
                status: event.status,
                timestamp: event.timestamp,
                safeSummary: event.safeSummary,
              })),
            },
          },
        });
        return;
      }
      if (url.pathname === "/llm/providers") {
        sendJson(response, 200, { ok: true, data: { schemaVersion: 1, providers: listProviders(), checks: checkProviders() } });
        return;
      }
      if (url.pathname === "/" || url.pathname === "/panel") {
        sendFile(response, path.join(panelRoot, "index.html"), "text/html; charset=utf-8");
        return;
      }
      if (url.pathname === "/setup") {
        sendSetupFile(response, panelRoot, "setup.html", "text/html; charset=utf-8");
        return;
      }
      if (url.pathname === "/setup.js") {
        sendSetupFile(response, panelRoot, "setup.js", "application/javascript; charset=utf-8");
        return;
      }
      if (url.pathname === "/setup.css") {
        sendSetupFile(response, panelRoot, "setup.css", "text/css; charset=utf-8");
        return;
      }
      if (url.pathname === "/panel.js") {
        sendFile(response, path.join(panelRoot, "panel.js"), "application/javascript; charset=utf-8");
        return;
      }
      if (url.pathname === "/panel.css") {
        sendFile(response, path.join(panelRoot, "panel.css"), "text/css; charset=utf-8");
        return;
      }
      if (url.pathname === "/design") {
        redirect(response, "/design/");
        return;
      }
      if (url.pathname === "/design/" || url.pathname.startsWith("/design/")) {
        sendDesignFile(response, repoRoot, url.pathname);
        return;
      }

      sendJson(response, 404, { ok: false, error: "not_found" });
    } catch {
      sendJson(response, 500, { ok: false, error: "internal_error" });
    }
  });
}

function startServer(options = {}) {
  const host = options.host || "127.0.0.1";
  const containerHostAllowed = host === "0.0.0.0" && process.env.ORQUESTRADOR_CONTAINER === "1";
  if (host !== "127.0.0.1" && host !== "localhost" && !containerHostAllowed) {
    throw new Error("API local so pode escutar em 127.0.0.1/localhost.");
  }
  const server = createServer(options);
  const port = Number(options.port || 0);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

module.exports = {
  createServer,
  startServer,
};
