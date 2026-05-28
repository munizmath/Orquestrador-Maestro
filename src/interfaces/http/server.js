"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { buildAlertsViewModel, buildInsightsViewModel, buildRunsViewModel, buildSkillsViewModel, buildStatusViewModel } = require("../../application/view-models.js");
const { listRuns, getRun } = require("../../application/run-registry.js");
const { createLocalStore } = require("../../infrastructure/local-store.js");
const { listCapabilities } = require("../../application/integration-service.js");
const { checkProviders, listProviders } = require("../../application/llm-service.js");
const { listConnectors } = require("../../application/connector-service.js");
const { listWorkflows } = require("../../application/workflow-service.js");
const { listTasks } = require("../../application/queue-service.js");
const { buildMetrics } = require("../../application/metrics-service.js");
const { listLiveAdapters } = require("../../application/live-adapters.js");
const { explainConfig } = require("../../infrastructure/config-loader.js");
const { listActions } = require("../../application/action-service.js");

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendFile(response, filePath, contentType) {
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(fs.readFileSync(filePath));
}

function createServer(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const store = options.store || createLocalStore({ repoRoot, rootDir: options.stateDir || undefined });
  const panelRoot = path.join(repoRoot, "src", "interfaces", "panel");

  return http.createServer((request, response) => {
    try {
      if (request.method !== "GET") {
        sendJson(response, 405, { ok: false, error: "method_not_allowed" });
        return;
      }

      const url = new URL(request.url, "http://127.0.0.1");
      const status = () => buildStatusViewModel(repoRoot, { store });

      if (url.pathname === "/health" || url.pathname === "/status") {
        sendJson(response, 200, { ok: true, data: status() });
        return;
      }
      if (url.pathname === "/version") {
        sendJson(response, 200, { ok: true, data: { schemaVersion: 1, name: "orquestrador-maestro-local-api" } });
        return;
      }
      if (url.pathname === "/skills") {
        sendJson(response, 200, { ok: true, data: buildSkillsViewModel(repoRoot) });
        return;
      }
      if (url.pathname === "/runs") {
        sendJson(response, 200, { ok: true, data: buildRunsViewModel(store) });
        return;
      }
      if (url.pathname.startsWith("/runs/")) {
        const runId = decodeURIComponent(url.pathname.slice("/runs/".length));
        const run = getRun(store, runId);
        sendJson(response, run ? 200 : 404, run ? { ok: true, data: { run } } : { ok: false, error: "run_not_found" });
        return;
      }
      if (url.pathname === "/alerts") {
        sendJson(response, 200, { ok: true, data: buildAlertsViewModel(status()) });
        return;
      }
      if (url.pathname === "/insights") {
        sendJson(response, 200, { ok: true, data: buildInsightsViewModel(repoRoot, { store }) });
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
        sendJson(response, 200, { ok: true, data: { schemaVersion: 1, tasks: listTasks(store) } });
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
      if (url.pathname === "/actions") {
        sendJson(response, 200, { ok: true, data: { schemaVersion: 1, actions: listActions() } });
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
      if (url.pathname === "/panel.js") {
        sendFile(response, path.join(panelRoot, "panel.js"), "application/javascript; charset=utf-8");
        return;
      }
      if (url.pathname === "/panel.css") {
        sendFile(response, path.join(panelRoot, "panel.css"), "text/css; charset=utf-8");
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
  if (host !== "127.0.0.1" && host !== "localhost") {
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
