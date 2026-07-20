"use strict";

const { checkConnector, dryRunConnector, executeConnector } = require("./connector-service.js");
const { loadConfig } = require("../infrastructure/config-loader.js");
const { buildIdempotencyKey, createIntegrationIntent } = require("./integration-service.js");
const { CLASSIFICATIONS } = require("../core/security.js");

function getN8nConfig(context = {}) {
  const loaded = loadConfig({ repoRoot: context.repoRoot, configPath: context.configPath });
  const n8n = loaded.config.adapters && loaded.config.adapters.n8n ? loaded.config.adapters.n8n : {};
  const webhookEnv = n8n.webhookEnv || "ORQUESTRADOR_N8N_WEBHOOK_URL";
  const webhookUrl = process.env[webhookEnv] || "";
  return {
    loaded,
    webhookUrl,
    webhookEnv,
    allowedHosts: n8n.allowedHosts || ["127.0.0.1", "localhost"],
  };
}

function checkN8n(context = {}) {
  const config = getN8nConfig(context);
  const connector = checkConnector("live-n8n", context);
  return {
    ok: connector.ok,
    mode: connector.mode || "live-disabled",
    webhookConfigured: Boolean(config.webhookUrl),
    webhookEnv: config.webhookEnv,
    missingConfig: connector.missingConfig || (config.webhookUrl ? [] : [config.webhookEnv]),
  };
}

function dryRunN8n(workflowId, payload = {}, context = {}) {
  const config = getN8nConfig(context);
  const intent = createIntegrationIntent({
    action: "workflow.trigger",
    target: "live-n8n",
    classification: context.classification || CLASSIFICATIONS.PUBLIC_SAFE,
    payload: { workflowId, payload },
  });
  const idempotencyKey = context.idempotencyKey || buildIdempotencyKey(intent);
  const result = dryRunConnector("live-n8n", {
    action: "workflow.trigger",
    payload: { workflowId, payload },
    classification: context.classification || CLASSIFICATIONS.PUBLIC_SAFE,
  }, {
    ...context,
    confirmed: Boolean(context.confirmed),
    idempotencyKey,
  });
  return {
    ...result,
    workflowId,
    webhookConfigured: Boolean(config.webhookUrl),
    webhookEnv: config.webhookEnv,
    idempotencyKey,
  };
}

async function triggerN8n(workflowId, payload = {}, context = {}) {
  const config = getN8nConfig(context);
  const dryRun = dryRunN8n(workflowId, payload, { ...context, confirmed: true });
  if (!config.webhookUrl) {
    return { ok: false, code: "n8n_webhook_missing", dryRun };
  }
  return executeConnector("live-n8n", {
    action: "workflow.trigger",
    payload: { workflowId, payload },
    classification: context.classification || CLASSIFICATIONS.PUBLIC_SAFE,
  }, {
    ...context,
    url: config.webhookUrl,
    allowedHosts: config.allowedHosts,
    dryRunCompleted: Boolean(context.dryRunCompleted),
    idempotencyKey: context.idempotencyKey || dryRun.idempotencyKey,
    confirmed: true,
    confirmedExternal: Boolean(context.confirmedExternal),
    liveHttpEnabled: Boolean(context.liveHttpEnabled),
  });
}

module.exports = {
  checkN8n,
  dryRunN8n,
  triggerN8n,
};
