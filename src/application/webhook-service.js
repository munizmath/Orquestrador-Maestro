"use strict";

const { checkConnector, dryRunConnector, executeConnector } = require("./connector-service.js");
const { loadConfig } = require("../infrastructure/config-loader.js");
const { buildIdempotencyKey, createIntegrationIntent } = require("./integration-service.js");
const { CLASSIFICATIONS } = require("../core/security.js");

function getWebhookConfig(context = {}) {
  const loaded = loadConfig({ repoRoot: context.repoRoot, configPath: context.configPath });
  const webhook = loaded.config.adapters && loaded.config.adapters.webhook ? loaded.config.adapters.webhook : {};
  const endpointEnv = webhook.endpointEnv || "ORQUESTRADOR_WEBHOOK_URL";
  const endpoint = process.env[endpointEnv] || "";
  return {
    loaded,
    endpoint,
    endpointEnv,
    allowedHosts: webhook.allowedHosts || ["127.0.0.1", "localhost"],
  };
}

function checkWebhook(context = {}) {
  const config = getWebhookConfig(context);
  const connector = checkConnector("live-webhook", context);
  return {
    ok: connector.ok,
    mode: connector.mode || "live-disabled",
    endpointConfigured: Boolean(config.endpoint),
    endpointEnv: config.endpointEnv,
    missingConfig: connector.missingConfig || (config.endpoint ? [] : [config.endpointEnv]),
  };
}

function dryRunWebhook(payload = {}, context = {}) {
  const config = getWebhookConfig(context);
  const intent = createIntegrationIntent({
    action: "webhook.emit",
    target: "live-webhook",
    classification: context.classification || CLASSIFICATIONS.PUBLIC_SAFE,
    payload,
  });
  const idempotencyKey = context.idempotencyKey || buildIdempotencyKey(intent);
  const result = dryRunConnector("live-webhook", {
    action: "webhook.emit",
    payload,
    classification: context.classification || CLASSIFICATIONS.PUBLIC_SAFE,
  }, {
    ...context,
    confirmed: Boolean(context.confirmed),
    idempotencyKey,
  });
  return {
    ...result,
    endpointConfigured: Boolean(config.endpoint),
    endpointEnv: config.endpointEnv,
    idempotencyKey,
  };
}

async function sendWebhook(payload = {}, context = {}) {
  const config = getWebhookConfig(context);
  const dryRun = dryRunWebhook(payload, { ...context, confirmed: true });
  if (!config.endpoint) {
    return { ok: false, code: "webhook_endpoint_missing", dryRun };
  }
  return executeConnector("live-webhook", {
    action: "webhook.emit",
    payload,
    classification: context.classification || CLASSIFICATIONS.PUBLIC_SAFE,
  }, {
    ...context,
    url: config.endpoint,
    allowedHosts: config.allowedHosts,
    dryRunCompleted: Boolean(context.dryRunCompleted),
    idempotencyKey: context.idempotencyKey || dryRun.idempotencyKey,
    confirmed: true,
    confirmedExternal: Boolean(context.confirmedExternal),
    liveHttpEnabled: Boolean(context.liveHttpEnabled),
  });
}

module.exports = {
  checkWebhook,
  dryRunWebhook,
  sendWebhook,
};
