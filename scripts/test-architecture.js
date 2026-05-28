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
const { enqueueTask, listTasks, runTask } = require("../src/application/queue-service.js");
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
  assert.equal(assertJsonEnvelope(parseJsonStdout(llm)).data.checks[0].id, "mock-llm");

  const integration = runCli([
    "integrations",
    "dry-run",
    "--json",
    "--confirmed",
    "--action",
    "webhook.emit",
    "--target",
    "mock-webhook",
    "--payload-json",
    "{\"message\":\"hello\"}",
  ]);
  assertExit(integration);
  assert.equal(assertJsonEnvelope(parseJsonStdout(integration)).data.dryRun.wouldExecute, true);

  const connectors = runCli(["connectors", "list", "--json"]);
  assertExit(connectors);
  assert(assertJsonEnvelope(parseJsonStdout(connectors)).data.connectors.some((item) => item.id === "mock-webhook"));

  const workflow = runCli(["workflows", "dry-run", "--json", "--workflow-id", "wf_mock_onboarding"]);
  assertExit(workflow);
  assert.equal(assertJsonEnvelope(parseJsonStdout(workflow)).data.workflow.id, "wf_mock_onboarding");

  const message = runCli(["messages", "preview", "--json", "--consent", "--recipient", "placeholder", "--body", "hello"]);
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
}

function testQueueMetricsAndRetention() {
  const store = createTempStore();
  const task = enqueueTask(store, { type: "validate", taskId: "task_test" });
  assert.equal(task.status, "pending");
  assert.equal(listTasks(store).length, 1);
  const finished = runTask(store, "task_test");
  assert.equal(finished.status, "succeeded");
  const metrics = buildMetrics(store);
  assert.equal(metrics.runs.total, 1);
  assert(metrics.audit.total >= 1);
  const purge = purgeRuns(store, 0, { dryRun: true });
  assert.equal(purge.dryRun, true);
  assert.equal(listLiveAdapters()[0].execute().code, "live_adapter_disabled");
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

    const blocked = await sendWhatsApp({ recipient: "placeholder", body: "hello" }, {
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

    const sent = await sendWhatsApp({ recipient: "placeholder", body: "hello" }, {
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
    const health = await requestJson(port, "/health");
    assert.equal(health.statusCode, 200);
    assert.equal(health.json.ok, true);
    const skills = await requestJson(port, "/skills");
    assert.equal(skills.statusCode, 200);
    assert(skills.json.data.count > 0);
    const llm = await requestJson(port, "/llm/providers");
    assert.equal(llm.json.data.providers[0].id, "mock-llm");
    const connectors = await requestJson(port, "/connectors");
    assert.equal(connectors.json.data.connectors[0].id, "mock-webhook");
    const metrics = await requestJson(port, "/metrics");
    assert.equal(metrics.json.data.schemaVersion, 1);
    const actions = await requestJson(port, "/actions");
    assert.equal(actions.json.data.actions[0].id, "adapter.check");
    const config = await requestJson(port, "/config");
    assert.equal(config.json.data.schemaVersion, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function testPanelAssetsAreLocalOnly() {
  const panelDir = path.join(repoRoot, "src", "interfaces", "panel");
  for (const file of ["index.html", "panel.js", "panel.css"]) {
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
  testAdapterRuntimeConfigTransportAndEgress();
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
