"use strict";

const { checkConnector, dryRunConnector, executeConnector } = require("./connector-service.js");
const { loadConfig } = require("../infrastructure/config-loader.js");
const { buildIdempotencyKey, createIntegrationIntent } = require("./integration-service.js");
const { CLASSIFICATIONS, redactValue } = require("../core/security.js");
const { recipientRef } = require("./message-service.js");

function getWhatsAppConfig(context = {}) {
  const loaded = loadConfig({ repoRoot: context.repoRoot, configPath: context.configPath });
  const whatsapp = loaded.config.adapters && loaded.config.adapters.whatsapp ? loaded.config.adapters.whatsapp : {};
  const tokenEnv = whatsapp.tokenEnv || "ORQUESTRADOR_WHATSAPP_TOKEN";
  const phoneIdEnv = whatsapp.phoneIdEnv || "ORQUESTRADOR_WHATSAPP_PHONE_ID";
  const endpointEnv = whatsapp.endpointEnv || "ORQUESTRADOR_WHATSAPP_API_URL";
  return {
    loaded,
    tokenEnv,
    phoneIdEnv,
    endpointEnv,
    tokenConfigured: Boolean(process.env[tokenEnv]),
    phoneIdConfigured: Boolean(process.env[phoneIdEnv]),
    endpoint: process.env[endpointEnv] || "",
    allowedHosts: whatsapp.allowedHosts || ["127.0.0.1", "localhost"],
  };
}

function checkWhatsApp(context = {}) {
  const config = getWhatsAppConfig(context);
  const connector = checkConnector("live-whatsapp", context);
  const ok = connector.ok && config.phoneIdConfigured && Boolean(config.endpoint);
  return {
    ok,
    mode: ok ? "live-ready" : "live-disabled",
    tokenConfigured: config.tokenConfigured,
    phoneIdConfigured: config.phoneIdConfigured,
    endpointConfigured: Boolean(config.endpoint),
    missingConfig: [
      ...(config.tokenConfigured ? [] : [config.tokenEnv]),
      ...(config.phoneIdConfigured ? [] : [config.phoneIdEnv]),
      ...(config.endpoint ? [] : [config.endpointEnv]),
    ],
  };
}

function buildMessagePayload(input = {}) {
  return {
    recipientRef: recipientRef(input.recipient || "placeholder-recipient"),
    body: String(input.body || "").slice(0, 1000),
    templateId: input.templateId || "mock-template",
    locale: input.locale || "pt-BR",
  };
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function buildMetaMessagePayload(input = {}) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(input.recipient || ""),
    type: "text",
    text: {
      preview_url: false,
      body: String(input.body || "").slice(0, 1000),
    },
  };
}

function dryRunWhatsApp(input = {}, context = {}) {
  const payload = buildMessagePayload(input);
  const intent = createIntegrationIntent({
    action: "message.send",
    target: "live-whatsapp",
    classification: context.classification || CLASSIFICATIONS.PUBLIC_SAFE,
    payload,
  });
  const idempotencyKey = context.idempotencyKey || buildIdempotencyKey(intent);
  const check = checkWhatsApp(context);
  const result = dryRunConnector("live-whatsapp", {
    action: "message.send",
    payload,
    classification: context.classification || CLASSIFICATIONS.PUBLIC_SAFE,
  }, {
    ...context,
    confirmed: Boolean(context.confirmed),
    consent: Boolean(context.consent),
    idempotencyKey,
  });
  return {
    ...result,
    ok: check.ok && result.ok,
    check,
    recipientRef: payload.recipientRef,
    idempotencyKey,
  };
}

async function sendWhatsApp(input = {}, context = {}) {
  const config = getWhatsAppConfig(context);
  const dryRun = dryRunWhatsApp(input, { ...context, confirmed: true });
  if (!config.endpoint) {
    return { ok: false, code: "whatsapp_endpoint_missing", dryRun };
  }
  const result = await executeConnector("live-whatsapp", {
    action: "message.send",
    payload: buildMetaMessagePayload(input),
    classification: context.classification || CLASSIFICATIONS.PUBLIC_SAFE,
  }, {
    ...context,
    url: config.endpoint,
    headers: config.tokenConfigured ? { authorization: `Bearer ${process.env[config.tokenEnv]}` } : {},
    allowedHosts: config.allowedHosts,
    dryRunCompleted: Boolean(context.dryRunCompleted),
    idempotencyKey: context.idempotencyKey || dryRun.idempotencyKey,
    confirmed: true,
    confirmedExternal: Boolean(context.confirmedExternal),
    consent: Boolean(context.consent),
    liveHttpEnabled: Boolean(context.liveHttpEnabled),
  });
  return result.ok ? result : redactValue(result).value;
}

module.exports = {
  checkWhatsApp,
  dryRunWhatsApp,
  sendWhatsApp,
};
