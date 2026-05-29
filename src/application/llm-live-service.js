"use strict";

const { checkConnector, dryRunConnector, executeConnector } = require("./connector-service.js");
const { loadConfig } = require("../infrastructure/config-loader.js");
const { buildIdempotencyKey, createIntegrationIntent } = require("./integration-service.js");
const { CLASSIFICATIONS, hashText, redactValue } = require("../core/security.js");

function getLlmConfig(context = {}) {
  const loaded = loadConfig({ repoRoot: context.repoRoot, configPath: context.configPath });
  const llm = loaded.config.adapters && loaded.config.adapters.llm ? loaded.config.adapters.llm : {};
  const apiKeyEnv = llm.apiKeyEnv || "ORQUESTRADOR_LLM_API_KEY";
  const endpointEnv = llm.endpointEnv || "ORQUESTRADOR_LLM_API_URL";
  return {
    loaded,
    provider: llm.provider || "mock",
    apiKeyEnv,
    endpointEnv,
    apiKeyConfigured: Boolean(process.env[apiKeyEnv]),
    endpoint: process.env[endpointEnv] || "",
    allowedHosts: llm.allowedHosts || ["127.0.0.1", "localhost"],
  };
}

function checkLlmLive(context = {}) {
  const config = getLlmConfig(context);
  const connector = checkConnector("live-llm", context);
  const ok = connector.ok && Boolean(config.endpoint);
  return {
    ok,
    mode: ok ? "live-ready" : "live-disabled",
    provider: config.provider,
    apiKeyConfigured: config.apiKeyConfigured,
    endpointConfigured: Boolean(config.endpoint),
    missingConfig: [
      ...(config.apiKeyConfigured ? [] : [config.apiKeyEnv]),
      ...(config.endpoint ? [] : [config.endpointEnv]),
    ],
  };
}

function buildLlmPayload(input = {}) {
  const prompt = String(input.prompt || "");
  const redacted = redactValue(prompt);
  return {
    provider: input.provider || "configured",
    model: input.model || "configured-default",
    promptHash: hashText(prompt),
    redactedPrompt: redacted.value,
    budget: Number(input.budget || 1),
  };
}

function dryRunLlmLive(input = {}, context = {}) {
  const payload = buildLlmPayload(input);
  const intent = createIntegrationIntent({
    action: "llm.complete",
    target: "live-llm",
    classification: context.classification || CLASSIFICATIONS.PUBLIC_SAFE,
    payload,
  });
  const idempotencyKey = context.idempotencyKey || buildIdempotencyKey(intent);
  const check = checkLlmLive(context);
  const result = dryRunConnector("live-llm", {
    action: "llm.complete",
    payload,
    classification: context.classification || CLASSIFICATIONS.PUBLIC_SAFE,
  }, {
    ...context,
    confirmed: Boolean(context.confirmed),
    idempotencyKey,
  });
  return {
    ...result,
    ok: check.ok && result.ok && payload.budget > 0,
    check,
    promptHash: payload.promptHash,
    idempotencyKey,
  };
}

async function completeLlmLive(input = {}, context = {}) {
  const config = getLlmConfig(context);
  const dryRun = dryRunLlmLive(input, { ...context, confirmed: true });
  if (!config.endpoint) {
    return { ok: false, code: "llm_endpoint_missing", dryRun };
  }
  return executeConnector("live-llm", {
    action: "llm.complete",
    payload: buildLlmPayload(input),
    classification: context.classification || CLASSIFICATIONS.PUBLIC_SAFE,
  }, {
    ...context,
    url: config.endpoint,
    headers: config.apiKeyConfigured ? { authorization: `Bearer ${process.env[config.apiKeyEnv]}` } : {},
    allowedHosts: config.allowedHosts,
    dryRunCompleted: Boolean(context.dryRunCompleted),
    idempotencyKey: context.idempotencyKey || dryRun.idempotencyKey,
    confirmed: true,
    confirmedExternal: Boolean(context.confirmedExternal),
    liveHttpEnabled: Boolean(context.liveHttpEnabled),
  });
}

module.exports = {
  checkLlmLive,
  completeLlmLive,
  dryRunLlmLive,
};
