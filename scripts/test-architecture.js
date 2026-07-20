#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  assertExit,
  assertJsonEnvelope,
  parseJsonStdout,
  repoRoot,
  runCli,
} = require("./cli-test-harness.js");
const {
  CLASSIFICATIONS,
  classifyText,
  redactValue,
} = require("../src/core/security.js");
const { createAuditEvent } = require("../src/core/events.js");
const { evaluatePolicy } = require("../src/core/policies.js");
const { validateSchema, assertSchema } = require("../src/core/schemas.js");
const { assertPort, ports } = require("../src/core/ports.js");
const { createTempStore } = require("../src/infrastructure/local-store.js");
const { planMigrations, applyMigrations } = require("../src/infrastructure/migrations.js");
const { createRun, getRun, listRuns, updateRun } = require("../src/application/run-registry.js");
const { readAuditEvents } = require("../src/application/audit-log.js");
const { enqueueTask, listDeadLetters, listTasks, processQueue, runTask } = require("../src/application/queue-service.js");
const { buildMetrics, purgeRuns } = require("../src/application/metrics-service.js");
const { listLiveAdapters } = require("../src/application/live-adapters.js");
const { explainConfig, validateConfig } = require("../src/infrastructure/config-loader.js");
const { assertAllowedHost } = require("../src/infrastructure/http-client.js");
const { evaluateEgress } = require("../src/application/egress-service.js");
const { startServer } = require("../src/interfaces/http/server.js");
const { sendWebhook } = require("../src/application/webhook-service.js");
const { triggerN8n } = require("../src/application/n8n-service.js");
const { sendWhatsApp } = require("../src/application/whatsapp-service.js");
const { completeLlmLive } = require("../src/application/llm-live-service.js");
const { createQueryGateway } = require("../src/application/query-gateway.js");
const { createActionGateway } = require("../src/application/action-gateway.js");
const { buildActorContext } = require("../src/application/rbac-service.js");
const { buildTenantScope } = require("../src/application/tenant-scope-service.js");

function testRedaction() {
  const payload = {
    endpoint: "https://example.test/callback?access_key=sample-value",
    email: "person@example.test",
    phone: "+55 11 99999-9999",
    path: "/home/example/project/.env",
  };
  const result = redactValue(payload);
  const serialized = JSON.stringify(result.value);
  assert.notEqual(result.classification, CLASSIFICATIONS.PUBLIC_SAFE);
  assert(!serialized.includes("sample-value"));
  assert(!serialized.includes("person@example.test"));
  assert(!serialized.includes("99999"));
  assert(!serialized.includes("/home/example"));
  assert.notEqual(classifyText("plain public text"), CLASSIFICATIONS.SECRET);
}

function testSchemas() {
  const run = JSON.parse(fs.readFileSync(path.join(repoRoot, "tests", "fixtures", "schemas", "run-record.valid.json"), "utf8"));
  const event = JSON.parse(fs.readFileSync(path.join(repoRoot, "tests", "fixtures", "schemas", "audit-event.valid.json"), "utf8"));
  assert.equal(validateSchema("RunRecord", run).ok, true);
  assert.equal(validateSchema("AuditEvent", event).ok, true);
  assert.equal(validateSchema("RunRecord", { ...run, schemaVersion: 2 }).ok, false);
}

function testPorts() {
  assertPort(ports.RunStore, {
    create() {},
    update() {},
    get() {},
    list() {},
  });
  assert.throws(() => assertPort(ports.RunStore, { create() {} }), /missing method/);
}

function testPolicyDeniesUnsafeExternalActions() {
  assert.equal(evaluatePolicy("message.send", { classification: CLASSIFICATIONS.UNKNOWN }).ok, false);
  assert.equal(evaluatePolicy("message.send", {
    classification: CLASSIFICATIONS.PUBLIC_SAFE,
    external: true,
    dryRunCompleted: false,
  }).policy, "dry-run-required");
  assert.equal(evaluatePolicy("message.send", {
    classification: CLASSIFICATIONS.PUBLIC_SAFE,
    external: true,
    dryRunCompleted: true,
    idempotencyKey: "idem_test",
    confirmed: true,
  }).ok, true);
}

function testAuditEventIsSanitized() {
  const event = createAuditEvent({
    type: "policy.blocked",
    source: "test",
    safeSummary: "Blocked credential https://example.test/callback?access_key=sample-value",
    details: { path: "/home/example/project", endpoint: "https://example.test/hook?access_key=sample-value" },
    timestamp: "2026-01-01T00:00:00.000Z",
  });
  assertSchema("AuditEvent", event);
  const serialized = JSON.stringify(event);
  assert(!serialized.includes("sample-value"));
  assert(!serialized.includes("/home/example"));
}

function testLocalStoreAndMigrations() {
  const store = createTempStore();
  const plan = planMigrations(store);
  assert.equal(plan.ok, true);
  assert.equal(plan.actions.length, 1);
  const applied = applyMigrations(store);
  assert.equal(applied.applied, 1);
  assert.equal(store.readJson("manifest.json").schemaVersion, 1);
  store.writeJson("runs/run-test.json", { schemaVersion: 1, ok: true });
  assert.equal(store.listJson("runs").length, 1);
}

function testRunRegistrySanitizesAndAudits() {
  const store = createTempStore();
  applyMigrations(store);
  const run = createRun(store, {
    kind: "validation",
    command: "validate --credential https://example.test/callback?access_key=sample-value",
    summary: "Started from /home/example/project",
  }, {
    id: "run_test",
    now: () => "2026-01-01T00:00:00.000Z",
  });
  assert.equal(run.id, "run_test");
  assert(!JSON.stringify(run).includes("sample-value"));
  assert(!JSON.stringify(run).includes("/home/example"));
  updateRun(store, "run_test", {
    status: "succeeded",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    summary: "Validation passed",
  }, {
    now: () => "2026-01-01T00:00:01.000Z",
  });
  assert.equal(getRun(store, "run_test").status, "succeeded");
  assert.equal(listRuns(store).length, 1);
  assert(readAuditEvents(store).length >= 2);
}

function testCliMigrationDryRun() {
  const store = createTempStore();
  const result = runCli([
    "local",
    "migrate",
    "--dry-run",
    "--json",
    "--state-dir",
    store.rootDir,
  ]);
  assertExit(result);
  const parsed = assertJsonEnvelope(parseJsonStdout(result));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.actions.length, 1);
  assert.equal(fs.existsSync(path.join(store.rootDir, "manifest.json")), false);
}

function testCliMigrationApply() {
  const store = createTempStore();
  const result = runCli([
    "local",
    "migrate",
    "--apply",
    "--json",
    "--state-dir",
    store.rootDir,
  ]);
  assertExit(result);
  const parsed = assertJsonEnvelope(parseJsonStdout(result));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.applied, 1);
  assert.equal(fs.existsSync(path.join(store.rootDir, "manifest.json")), true);
}

function testCliRunsListJson() {
  const store = createTempStore();
  createRun(store, {
    kind: "validation",
    command: "validate",
    summary: "Validation passed",
  }, {
    id: "run_cli",
    now: () => "2026-01-01T00:00:00.000Z",
  });
  const result = runCli([
    "runs",
    "list",
    "--json",
    "--state-dir",
    store.rootDir,
  ]);
  assertExit(result);
  const parsed = assertJsonEnvelope(parseJsonStdout(result));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.runs[0].id, "run_cli");
}

function testCliRunsShowJsonAndError() {
  const store = createTempStore();
  createRun(store, {
    kind: "validation",
    command: "validate",
    summary: "Validation passed",
  }, {
    id: "run_show",
    now: () => "2026-01-01T00:00:00.000Z",
  });
  const found = runCli(["runs", "show", "run_show", "--json", "--state-dir", store.rootDir]);
  assertExit(found);
  const foundJson = assertJsonEnvelope(parseJsonStdout(found));
  assert.equal(foundJson.data.run.id, "run_show");

  const missing = runCli(["runs", "show", "missing", "--json", "--state-dir", store.rootDir]);
  assertExit(missing, 1);
  const missingJson = assertJsonEnvelope(parseJsonStdout(missing));
  assert.equal(missingJson.ok, false);
  assert.equal(missingJson.issues[0].code, "run_not_found");
}

function testOperationalCliCommands() {
  const store = createTempStore();
  const status = runCli(["status", "--json", "--state-dir", store.rootDir]);
  assertExit(status);
  assert.equal(assertJsonEnvelope(parseJsonStdout(status)).data.mode, "local-only");

  const insights = runCli(["insights", "--json", "--state-dir", store.rootDir]);
  assertExit(insights);
  assert.equal(assertJsonEnvelope(parseJsonStdout(insights)).data.runs.total, 0);

  const llm = runCli(["llm", "check", "--json"]);
  assertExit(llm);
  assert.equal(assertJsonEnvelope(parseJsonStdout(llm)).data.checks[0].id, "local-llm");

  const integration = runCli([
    "integrations",
    "dry-run",
    "--json",
    "--confirmed",
    "--action",
    "webhook.emit",
    "--target",
    "local-webhook-dry-run",
    "--payload-json",
    "{\"message\":\"hello\"}",
  ]);
  assertExit(integration);
  assert.equal(assertJsonEnvelope(parseJsonStdout(integration)).data.dryRun.wouldExecute, true);

  const connectors = runCli(["connectors", "list", "--json"]);
  assertExit(connectors);
  assert(assertJsonEnvelope(parseJsonStdout(connectors)).data.connectors.some((item) => item.id === "local-webhook-dry-run"));

  const workflow = runCli(["workflows", "dry-run", "--json", "--workflow-id", "wf_local_onboarding"]);
  assertExit(workflow);
  assert.equal(assertJsonEnvelope(parseJsonStdout(workflow)).data.workflow.id, "wf_local_onboarding");

  const message = runCli(["messages", "preview", "--json", "--consent", "--recipient", "recipient-test", "--body", "hello"]);
  assertExit(message);
  assert.equal(assertJsonEnvelope(parseJsonStdout(message)).data.consent, true);

  const adapters = runCli(["adapters", "live", "--json"]);
  assertExit(adapters);
  assert.equal(assertJsonEnvelope(parseJsonStdout(adapters)).data.adapters[0].ok, false);

  const config = runCli(["config", "validate", "--json"]);
  assertExit(config);
  assert.equal(assertJsonEnvelope(parseJsonStdout(config)).data.ok, true);

  const live = runCli(["connectors", "check", "--json", "--id", "live-webhook"]);
  assertExit(live, 1);
  assert.equal(assertJsonEnvelope(parseJsonStdout(live)).data.mode, "live-disabled");

  const webhook = runCli(["webhook", "check", "--json"]);
  assertExit(webhook, 1);
  assert.equal(assertJsonEnvelope(parseJsonStdout(webhook)).data.mode, "live-disabled");

  const n8n = runCli(["n8n", "check", "--json"]);
  assertExit(n8n, 1);
  assert.equal(assertJsonEnvelope(parseJsonStdout(n8n)).data.mode, "live-disabled");

  const whatsapp = runCli(["whatsapp", "check", "--json"]);
  assertExit(whatsapp, 1);
  assert.equal(assertJsonEnvelope(parseJsonStdout(whatsapp)).data.mode, "live-disabled");

  const llmLive = runCli(["llm", "live-check", "--json"]);
  assertExit(llmLive, 1);
  assert.equal(assertJsonEnvelope(parseJsonStdout(llmLive)).data.mode, "live-disabled");

  const setup = runCli(["setup", "local", "--dry-run", "--json"]);
  assertExit(setup);
  const setupJson = assertJsonEnvelope(parseJsonStdout(setup));
  assert.equal(setupJson.data.mode, "local-only");
  assert(setupJson.data.steps.some((step) => step.name === "install-plan"));

  const doctor = runCli(["setup", "doctor", "--json"]);
  assertExit(doctor);
  assert.equal(assertJsonEnvelope(parseJsonStdout(doctor)).data.mode, "local-only");
}

function testQueueMetricsAndRetention() {
  const store = createTempStore();
  const task = enqueueTask(store, { type: "validate", taskId: "task_test", payload: { checkSync: false } });
  assert.equal(task.status, "pending");
  assert.equal(listTasks(store).length, 1);
  const finished = runTask(store, "task_test", { repoRoot });
  assert.equal(finished.status, "succeeded");
  assert.equal(finished.attempts, 1);
  const metrics = buildMetrics(store);
  assert.equal(metrics.runs.total, 1);
  assert(metrics.audit.total >= 1);
  const purge = purgeRuns(store, 0, { dryRun: true });
  assert.equal(purge.dryRun, true);
  assert.equal(listLiveAdapters()[0].execute().code, "live_adapter_disabled");
}

function testQueueWorkerRetryBackoff() {
  const store = createTempStore();
  enqueueTask(store, {
    type: "llm.complete",
    taskId: "task_retry_test",
    idempotencyKey: "idem_retry_test",
    dryRun: { ok: true },
    retryPolicy: { maxAttempts: 2, baseDelayMs: 5000, maxDelayMs: 5000 },
  });
  const first = processQueue(store, { repoRoot, limit: 1 });
  assert.equal(first.processed, 1);
  assert.equal(first.tasks[0].status, "retrying");
  assert.equal(first.tasks[0].attempts, 1);
  assert(Date.parse(first.tasks[0].availableAt) > Date.now());
  const second = processQueue(store, { repoRoot, limit: 1 });
  assert.equal(second.processed, 0);

  store.writeJson("queue/task_retry_test.json", {
    ...first.tasks[0],
    availableAt: "2026-01-01T00:00:00.000Z",
  });
  const final = processQueue(store, { repoRoot, concurrency: 2 });
  assert.equal(final.processed, 1);
  assert.equal(final.tasks[0].status, "dead-letter");
  assert.equal(final.tasks[0].attempts, 2);
  assert.equal(listDeadLetters(store).length, 1);
  assert(readAuditEvents(store).some((event) => event.type === "job.dead_lettered"));
}

function testSkillRouteTask() {
  const store = createTempStore();
  enqueueTask(store, {
    type: "skill.route",
    taskId: "task_skill_route_test",
    payload: { prompt: "orquestrar whatsapp com webhook e retry" },
  });
  const result = processQueue(store, { repoRoot, concurrency: 2 });
  assert.equal(result.processed, 1);
  assert.equal(result.tasks[0].status, "succeeded");
  const run = getRun(store, result.tasks[0].runId);
  assert(run.artifacts.some((artifact) => artifact.type === "skill-route"));
}

function testAdapterRuntimeConfigTransportAndEgress() {
  const config = explainConfig({ repoRoot });
  assert.equal(config.schemaVersion, 1);
  assert.equal(validateConfig(config.redactedConfig).ok, true);
  assert.doesNotThrow(() => assertAllowedHost(new URL("http://127.0.0.1/test"), ["127.0.0.1"]));
  assert.throws(() => assertAllowedHost(new URL("https://example.test/"), ["127.0.0.1"]), /not allowed/);
  const blocked = evaluateEgress("webhook.emit", {
    payload: { message: "hello" },
    dryRunCompleted: false,
    idempotencyKey: "idem_test",
    confirmed: true,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.policy, "dry-run-required");
}

function testNextExperienceContractsFailClosed() {
  const store = createTempStore();
  const gateway = createQueryGateway({ repoRoot, store });
  const scope = buildTenantScope(repoRoot);
  const actorContext = buildActorContext({
    actorKey: "actor_local_test",
    roles: ["service.panel"],
    sessionKey: "session_local_test",
  });

  const allowed = gateway.execute({
    actorContext,
    query: queryEnvelope(scope),
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.queryName, "cockpit.summary.get");

  const missingScope = gateway.execute({
    actorContext,
    query: { ...queryEnvelope(scope), projectKey: "" },
  });
  assert.equal(missingScope.ok, false);
  assert.equal(missingScope.data.denial.reasonCode, "query_schema_invalid");

  const wrongRole = gateway.execute({
    actorContext: buildActorContext({
      actorKey: "actor_local_test",
      roles: ["maestro.viewer"],
      sessionKey: "session_local_test",
    }),
    query: queryEnvelope(scope, {
      queryName: "audit.events.list",
      fields: ["schemaVersion", "events", "count"],
      purpose: "audit.read",
    }),
  });
  assert.equal(wrongRole.ok, false);
  assert.equal(wrongRole.data.denial.reasonCode, "role_denied");

  const crossProject = gateway.execute({
    actorContext,
    query: queryEnvelope(scope, { projectKey: "project_other" }),
  });
  assert.equal(crossProject.ok, false);
  assert.equal(crossProject.data.denial.reasonCode, "tenant_scope_denied");

  const runs = gateway.execute({
    actorContext,
    query: queryEnvelope(scope, {
      queryName: "runs.timeline.list",
      fields: ["schemaVersion", "recent", "count"],
      purpose: "runs.read",
    }),
  });
  assert.equal(runs.ok, true);
  assert(!JSON.stringify(runs.data).includes("\"id\""));

  const connectors = gateway.execute({
    actorContext,
    query: queryEnvelope(scope, {
      queryName: "connectors.list",
      fields: ["schemaVersion", "connectors"],
      purpose: "connectors.read",
    }),
  });
  assert.equal(connectors.ok, true);
  assert.equal(connectors.data.connectors[0].connectorKey, "local-webhook-dry-run");

  const overview = gateway.execute({
    actorContext,
    query: queryEnvelope(scope, {
      queryName: "cockpit.overview.get",
      fields: ["schemaVersion", "readiness", "queue", "metrics", "audit"],
      purpose: "panel.read",
    }),
  });
  assert.equal(overview.ok, true);
  assert(Object.prototype.hasOwnProperty.call(overview.data, "readiness"));
}

function testActionGatewayDryRunAndExecution() {
  const store = createTempStore();
  const gateway = createActionGateway({ repoRoot, store });
  const scope = buildTenantScope(repoRoot);
  const operator = buildActorContext({
    actorKey: "actor_local_test",
    roles: ["maestro.operator"],
    sessionKey: "session_action_test",
  });

  const viewerDenied = gateway.dryRun({
    actorContext: buildActorContext({
      actorKey: "actor_local_test",
      roles: ["maestro.viewer"],
      sessionKey: "session_action_test",
    }),
    action: actionEnvelope(scope),
  });
  assert.equal(viewerDenied.ok, false);
  assert.equal(viewerDenied.data.denial.reasonCode, "role_denied");

  const blockedExecute = gateway.execute({
    actorContext: operator,
    action: actionEnvelope(scope),
  });
  assert.equal(blockedExecute.ok, false);
  assert.equal(blockedExecute.data.denial.reasonCode, "dry_run_required");

  const dryRun = gateway.dryRun({
    actorContext: operator,
    action: actionEnvelope(scope),
  });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.data.dryRun.wouldExecute, true);
  assert(dryRun.data.dryRun.dryRunKey.startsWith("dryrun_"));

  const executed = gateway.execute({
    actorContext: operator,
    action: actionEnvelope(scope, { dryRunKey: dryRun.data.dryRun.dryRunKey }),
  });
  assert.equal(executed.ok, true);
  assert(executed.data.runKey.startsWith("run_"));
  assert.equal(listRuns(store).length, 1);
  const auditTypes = readAuditEvents(store).map((event) => event.type);
  assert(auditTypes.includes("action.started"));
  assert(auditTypes.includes("action.finished"));
}

function requestJson(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({
      host: "127.0.0.1",
      port,
      path: pathname,
      timeout: 5000,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve({ statusCode: response.statusCode, json: JSON.parse(body) });
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function requestText(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({
      host: "127.0.0.1",
      port,
      path: pathname,
      timeout: 5000,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        resolve({ statusCode: response.statusCode, headers: response.headers, body });
      });
    }).on("error", reject);
  });
}

function postJson(port, pathname, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: pathname,
      method: "POST",
      timeout: 5000,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        ...headers,
      },
    }, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { data += chunk; });
      response.on("end", () => {
        try {
          resolve({ statusCode: response.statusCode, json: JSON.parse(data) });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function queryEnvelope(scope, overrides = {}) {
  return {
    schemaVersion: 1,
    queryName: overrides.queryName || "cockpit.summary.get",
    workspaceKey: overrides.workspaceKey || scope.workspaceKey,
    projectKey: overrides.projectKey || scope.projectKey,
    actorKey: overrides.actorKey || "actor_local_test",
    filters: overrides.filters || {},
    pagination: overrides.pagination || { limit: 25, offset: 0 },
    fields: overrides.fields || ["schemaVersion", "ok", "mode", "health"],
    purpose: overrides.purpose || "panel.read",
  };
}

function actionEnvelope(scope, overrides = {}) {
  return {
    schemaVersion: 1,
    actionName: overrides.actionName || "validation.run",
    workspaceKey: overrides.workspaceKey || scope.workspaceKey,
    projectKey: overrides.projectKey || scope.projectKey,
    actorKey: overrides.actorKey || "actor_local_test",
    idempotencyKey: overrides.idempotencyKey || "idem_validation_test",
    purpose: overrides.purpose || "validation.run",
    payload: overrides.payload || { checkSync: false, includePackageCheck: false },
    dryRunKey: overrides.dryRunKey || null,
    confirmationKey: overrides.confirmationKey || null,
  };
}

function startWebhookReceiver() {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push({ method: request.method, url: request.url, body });
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{\"ok\":true}");
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, requests, port: server.address().port }));
  });
}

async function testWebhookLiveLocalFlow() {
  const receiver = await startWebhookReceiver();
  const oldEndpoint = process.env.TEST_WEBHOOK_URL;
  try {
    process.env.TEST_WEBHOOK_URL = `http://127.0.0.1:${receiver.port}/hook`;
    const store = createTempStore();
    const configPath = path.join(store.rootDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({
      schemaVersion: 1,
      adapters: {
        webhook: {
          endpointEnv: "TEST_WEBHOOK_URL",
          allowedHosts: ["127.0.0.1"],
        },
      },
    }, null, 2), "utf8");

    const blocked = await sendWebhook({ message: "hello" }, {
      repoRoot,
      configPath,
      idempotencyKey: "idem_webhook_test",
      dryRunCompleted: true,
      confirmedExternal: false,
      liveHttpEnabled: true,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "external-confirmation-required");
    assert.equal(receiver.requests.length, 0);

    const sent = await sendWebhook({ message: "hello" }, {
      repoRoot,
      configPath,
      idempotencyKey: "idem_webhook_test",
      dryRunCompleted: true,
      confirmedExternal: true,
      liveHttpEnabled: true,
    });
    assert.equal(sent.ok, true);
    assert.equal(receiver.requests.length, 1);
  } finally {
    if (oldEndpoint === undefined) delete process.env.TEST_WEBHOOK_URL;
    else process.env.TEST_WEBHOOK_URL = oldEndpoint;
    await new Promise((resolve) => receiver.server.close(resolve));
  }
}

async function testN8nLiveLocalFlow() {
  const receiver = await startWebhookReceiver();
  const oldEndpoint = process.env.TEST_N8N_WEBHOOK_URL;
  try {
    process.env.TEST_N8N_WEBHOOK_URL = `http://127.0.0.1:${receiver.port}/n8n`;
    const store = createTempStore();
    const configPath = path.join(store.rootDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({
      schemaVersion: 1,
      adapters: {
        n8n: {
          webhookEnv: "TEST_N8N_WEBHOOK_URL",
          allowedHosts: ["127.0.0.1"],
        },
      },
    }, null, 2), "utf8");

    const blocked = await triggerN8n("wf_live_test", { event: "hello" }, {
      repoRoot,
      configPath,
      idempotencyKey: "idem_n8n_test",
      dryRunCompleted: true,
      confirmedExternal: false,
      liveHttpEnabled: true,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "external-confirmation-required");
    assert.equal(receiver.requests.length, 0);

    const sent = await triggerN8n("wf_live_test", { event: "hello" }, {
      repoRoot,
      configPath,
      idempotencyKey: "idem_n8n_test",
      dryRunCompleted: true,
      confirmedExternal: true,
      liveHttpEnabled: true,
    });
    assert.equal(sent.ok, true);
    assert.equal(receiver.requests.length, 1);
  } finally {
    if (oldEndpoint === undefined) delete process.env.TEST_N8N_WEBHOOK_URL;
    else process.env.TEST_N8N_WEBHOOK_URL = oldEndpoint;
    await new Promise((resolve) => receiver.server.close(resolve));
  }
}

async function testWhatsAppLiveLocalFlow() {
  const receiver = await startWebhookReceiver();
  const oldEndpoint = process.env.TEST_WHATSAPP_API_URL;
  const oldToken = process.env.TEST_WHATSAPP_TOKEN;
  const oldPhone = process.env.TEST_WHATSAPP_PHONE_ID;
  try {
    process.env.TEST_WHATSAPP_API_URL = `http://127.0.0.1:${receiver.port}/whatsapp`;
    process.env.TEST_WHATSAPP_TOKEN = "test-token";
    process.env.TEST_WHATSAPP_PHONE_ID = "test-phone-id";
    const store = createTempStore();
    const configPath = path.join(store.rootDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({
      schemaVersion: 1,
      adapters: {
        whatsapp: {
          tokenEnv: "TEST_WHATSAPP_TOKEN",
          phoneIdEnv: "TEST_WHATSAPP_PHONE_ID",
          endpointEnv: "TEST_WHATSAPP_API_URL",
          allowedHosts: ["127.0.0.1"],
        },
      },
    }, null, 2), "utf8");

    const blocked = await sendWhatsApp({ recipient: "recipient-test", body: "hello" }, {
      repoRoot,
      configPath,
      idempotencyKey: "idem_whatsapp_test",
      dryRunCompleted: true,
      confirmedExternal: true,
      liveHttpEnabled: true,
      consent: false,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "consent-required");
    assert.equal(receiver.requests.length, 0);

    const sent = await sendWhatsApp({ recipient: "recipient-test", body: "hello" }, {
      repoRoot,
      configPath,
      idempotencyKey: "idem_whatsapp_test",
      dryRunCompleted: true,
      confirmedExternal: true,
      liveHttpEnabled: true,
      consent: true,
    });
    assert.equal(sent.ok, true);
    assert.equal(receiver.requests.length, 1);
  } finally {
    if (oldEndpoint === undefined) delete process.env.TEST_WHATSAPP_API_URL;
    else process.env.TEST_WHATSAPP_API_URL = oldEndpoint;
    if (oldToken === undefined) delete process.env.TEST_WHATSAPP_TOKEN;
    else process.env.TEST_WHATSAPP_TOKEN = oldToken;
    if (oldPhone === undefined) delete process.env.TEST_WHATSAPP_PHONE_ID;
    else process.env.TEST_WHATSAPP_PHONE_ID = oldPhone;
    await new Promise((resolve) => receiver.server.close(resolve));
  }
}

async function testLlmLiveLocalFlow() {
  const receiver = await startWebhookReceiver();
  const oldEndpoint = process.env.TEST_LLM_API_URL;
  const oldKey = process.env.TEST_LLM_API_KEY;
  try {
    process.env.TEST_LLM_API_URL = `http://127.0.0.1:${receiver.port}/llm`;
    process.env.TEST_LLM_API_KEY = "test-key";
    const store = createTempStore();
    const configPath = path.join(store.rootDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({
      schemaVersion: 1,
      adapters: {
        llm: {
          provider: "test",
          apiKeyEnv: "TEST_LLM_API_KEY",
          endpointEnv: "TEST_LLM_API_URL",
          allowedHosts: ["127.0.0.1"],
        },
      },
    }, null, 2), "utf8");

    const blocked = await completeLlmLive({ prompt: "hello", budget: 1 }, {
      repoRoot,
      configPath,
      idempotencyKey: "idem_llm_test",
      dryRunCompleted: false,
      confirmedExternal: true,
      liveHttpEnabled: true,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "dry-run-required");
    assert.equal(receiver.requests.length, 0);

    const sent = await completeLlmLive({ prompt: "hello", budget: 1 }, {
      repoRoot,
      configPath,
      idempotencyKey: "idem_llm_test",
      dryRunCompleted: true,
      confirmedExternal: true,
      liveHttpEnabled: true,
    });
    assert.equal(sent.ok, true);
    assert.equal(receiver.requests.length, 1);
  } finally {
    if (oldEndpoint === undefined) delete process.env.TEST_LLM_API_URL;
    else process.env.TEST_LLM_API_URL = oldEndpoint;
    if (oldKey === undefined) delete process.env.TEST_LLM_API_KEY;
    else process.env.TEST_LLM_API_KEY = oldKey;
    await new Promise((resolve) => receiver.server.close(resolve));
  }
}

async function testHttpApi() {
  const store = createTempStore();
  const server = await startServer({ repoRoot, port: 0, store });
  try {
    const port = server.address().port;
    const panel = await requestText(port, "/panel");
    assert.equal(panel.statusCode, 200);
    assert.match(panel.headers["content-type"], /text\/html/);
    assert(panel.body.includes("/panel.js"));
    assert(!panel.body.includes("Painel do Orquestrador.html"));
    const designRedirect = await requestText(port, "/design");
    assert.equal(designRedirect.statusCode, 302);
    assert.equal(designRedirect.headers.location, "/design/");
    const designPanel = await requestText(port, "/design/painel");
    assert.equal(designPanel.statusCode, 200);
    assert(designPanel.body.includes("Orquestrador"));
    const designIndex = await requestText(port, "/design/");
    assert.equal(designIndex.statusCode, 200);
    assert(designIndex.body.includes("dash-app.jsx"));
    const health = await requestJson(port, "/health");
    assert.equal(health.statusCode, 200);
    assert.equal(health.json.ok, true);
    assert.equal(health.json.data.schemaVersion, 1);
    const skills = await requestJson(port, "/skills");
    assert.equal(skills.statusCode, 200);
    assert(skills.json.data.count > 0);
    const llm = await requestJson(port, "/llm/providers");
    assert.equal(llm.json.data.providers[0].id, "local-llm");
    const connectors = await requestJson(port, "/connectors");
    assert.equal(connectors.json.data.connectors[0].id, "local-webhook-dry-run");
    const metrics = await requestJson(port, "/metrics");
    assert.equal(metrics.json.data.schemaVersion, 1);
    const actions = await requestJson(port, "/actions");
    assert.equal(actions.json.data.actions[0].id, "adapter.check");
    const config = await requestJson(port, "/config");
    assert.equal(config.json.data.schemaVersion, 1);
    const overview = await requestJson(port, "/overview");
    assert.equal(overview.json.data.schemaVersion, 1);
    assert(Object.prototype.hasOwnProperty.call(overview.json.data, "readiness"));
    assert(Object.prototype.hasOwnProperty.call(overview.json.data, "audit"));
    assert(Object.prototype.hasOwnProperty.call(overview.json.data.queue, "deadLetter"));
    const setup = await requestJson(port, "/setup/status");
    assert.equal(setup.statusCode, 200);
    assert.equal(setup.json.data.mode, "local-only");
    assert(Object.prototype.hasOwnProperty.call(setup.json.data, "env"));
    assert(Object.prototype.hasOwnProperty.call(setup.json.data, "fields"));
    assert(Object.prototype.hasOwnProperty.call(setup.json.data, "commands"));
    assert(!JSON.stringify(setup.json.data.fields).includes("test-token"));
    const report = await requestJson(port, "/setup/report");
    assert.equal(report.statusCode, 200);
    assert.equal(report.json.data.summary.mode, "local-only");
    const saved = await postJson(port, "/setup/config", {
      whatsappToken: "test-token",
      whatsappPhoneId: "phone-id",
      whatsappApiUrl: "http://127.0.0.1:9999/messages",
      whatsappSandboxRecipient: "5511999999999",
      llmApiKey: "test-key",
      llmApiUrl: "http://127.0.0.1:9999/llm",
    });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json.data.ok, true);
    assert(!JSON.stringify(saved.json).includes("test-token"));
    const dryRun = await postJson(port, "/setup/whatsapp/dry-run", {
      whatsappToken: "test-token",
      whatsappPhoneId: "phone-id",
      whatsappApiUrl: "http://127.0.0.1:9999/messages",
      whatsappSandboxRecipient: "5511999999999",
      consent: true,
      confirmExternal: true,
    });
    assert.equal(dryRun.statusCode, 200);
    assert.equal(dryRun.json.data.ok, true);

    const scope = buildTenantScope(repoRoot);
    const scopeResponse = await requestJson(port, "/query/scope");
    assert.equal(scopeResponse.statusCode, 200);
    assert.equal(scopeResponse.json.data.scope.projectKey, scope.projectKey);
    assert.equal(scopeResponse.json.data.actorContext.roles[0], "service.panel");

    const blockedQuery = await postJson(port, "/query", {
      ...queryEnvelope(scope),
    });
    assert.equal(blockedQuery.statusCode, 401);
    assert.equal(blockedQuery.json.error, "session_required");

    const allowedQuery = await postJson(port, "/query", {
      ...queryEnvelope(scope),
    }, {
      "x-omx-session": "session_http_test",
      "x-omx-roles": "service.panel",
    });
    assert.equal(allowedQuery.statusCode, 200);
    assert.equal(allowedQuery.json.ok, true);

    const deniedQuery = await postJson(port, "/query", {
      ...queryEnvelope(scope, {
        queryName: "audit.events.list",
        fields: ["schemaVersion", "events", "count"],
        purpose: "audit.read",
      }),
    }, {
      "x-omx-session": "session_http_test",
      "x-omx-roles": "service.panel",
    });
    assert.equal(deniedQuery.statusCode, 403);
    assert.equal(deniedQuery.json.data.denial.reasonCode, "role_denied");

    const connectorsQuery = await postJson(port, "/query", {
      ...queryEnvelope(scope, {
        queryName: "connectors.list",
        fields: ["schemaVersion", "connectors"],
        purpose: "connectors.read",
      }),
    }, {
      "x-omx-session": "session_http_test",
      "x-omx-roles": "service.panel",
    });
    assert.equal(connectorsQuery.statusCode, 200);
    assert.equal(connectorsQuery.json.data.connectors[0].connectorKey, "local-webhook-dry-run");

    const actionScope = scopeResponse.json.data.scope;
    const blockedAction = await postJson(port, "/action/dry-run", {
      ...actionEnvelope(actionScope, { actorKey: "actor_http_test" }),
    });
    assert.equal(blockedAction.statusCode, 401);

    const viewerAction = await postJson(port, "/action/dry-run", {
      ...actionEnvelope(actionScope, { actorKey: "actor_http_test" }),
    }, {
      "x-omx-session": "session_http_test",
      "x-omx-roles": "maestro.viewer",
    });
    assert.equal(viewerAction.statusCode, 403);
    assert.equal(viewerAction.json.data.denial.reasonCode, "role_denied");

    const dryRunAction = await postJson(port, "/action/dry-run", {
      ...actionEnvelope(actionScope, { actorKey: "actor_http_test" }),
    }, {
      "x-omx-session": "session_http_test",
      "x-omx-roles": "maestro.operator",
    });
    assert.equal(dryRunAction.statusCode, 200);
    assert.equal(dryRunAction.json.data.dryRun.wouldExecute, true);

    const executeAction = await postJson(port, "/action/execute", {
      ...actionEnvelope(actionScope, {
        actorKey: "actor_http_test",
        dryRunKey: dryRunAction.json.data.dryRun.dryRunKey,
      }),
    }, {
      "x-omx-session": "session_http_test",
      "x-omx-roles": "maestro.operator",
    });
    assert.equal(executeAction.statusCode, 200);
    assert(executeAction.json.data.runKey.startsWith("run_"));

    const inbound = await postJson(port, "/webhooks/inbound", {
      source: "test-provider",
      eventId: "event_http_inbound_test",
      eventType: "whatsapp.message.received",
      prompt: "rotear mensagem whatsapp para skill",
    });
    assert.equal(inbound.statusCode, 202);
    assert.equal(inbound.json.data.task.type, "skill.route");
    assert.equal(inbound.json.data.deduped, false);

    const duplicateInbound = await postJson(port, "/webhooks/inbound", {
      source: "test-provider",
      eventId: "event_http_inbound_test",
      eventType: "whatsapp.message.received",
      prompt: "rotear mensagem whatsapp para skill",
    });
    assert.equal(duplicateInbound.statusCode, 200);
    assert.equal(duplicateInbound.json.data.deduped, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function testPanelAssetsAreLocalOnly() {
  const panelDir = path.join(repoRoot, "src", "interfaces", "panel");
  for (const file of ["index.html", "panel.js", "panel.css", "setup.html", "setup.js", "setup.css"]) {
    const content = fs.readFileSync(path.join(panelDir, file), "utf8");
    assert(!/https?:\/\//i.test(content), `${file} references an external URL`);
  }
}

function testCoreDependencyBoundaries() {
  const coreDir = path.join(repoRoot, "src", "core");
  const files = fs.readdirSync(coreDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => path.join(coreDir, file));
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    assert(!content.includes("../infrastructure"), `${file} imports infrastructure`);
    assert(!content.includes("../application"), `${file} imports application`);
    assert(!content.includes("../../scripts"), `${file} imports scripts`);
  }
}

async function run() {
  testRedaction();
  testSchemas();
  testPorts();
  testPolicyDeniesUnsafeExternalActions();
  testAuditEventIsSanitized();
  testLocalStoreAndMigrations();
  testRunRegistrySanitizesAndAudits();
  testCliMigrationDryRun();
  testCliMigrationApply();
  testCliRunsListJson();
  testCliRunsShowJsonAndError();
  testOperationalCliCommands();
  testQueueMetricsAndRetention();
  testQueueWorkerRetryBackoff();
  testSkillRouteTask();
  testAdapterRuntimeConfigTransportAndEgress();
  testNextExperienceContractsFailClosed();
  testActionGatewayDryRunAndExecution();
  await testWebhookLiveLocalFlow();
  await testN8nLiveLocalFlow();
  await testWhatsAppLiveLocalFlow();
  await testLlmLiveLocalFlow();
  await testHttpApi();
  testPanelAssetsAreLocalOnly();
  testCoreDependencyBoundaries();
  console.log("Architecture tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
