"use strict";

const { ADAPTER_MODES, createAdapter, createAdapterDescriptor, createRegistry } = require("../core/adapter-runtime.js");
const { CLASSIFICATIONS } = require("../core/security.js");
const { dryRunIntegration } = require("./integration-service.js");
const { evaluateEgress } = require("./egress-service.js");
const { loadConfig } = require("../infrastructure/config-loader.js");
const { requestJson } = require("../infrastructure/http-client.js");

function descriptor(id, type, mode, capabilities, permissions = {}, requiredConfig = []) {
  return createAdapterDescriptor({ id, type, mode, capabilities, permissions, requiredConfig });
}

function localDryRunLifecycle(id, type) {
  return {
    configure() {
      return { ok: true, mode: ADAPTER_MODES.LOCAL_DRY_RUN, id };
    },
    check() {
      return { ok: true, id, mode: ADAPTER_MODES.LOCAL_DRY_RUN };
    },
    plan(intent = {}) {
      return { ok: true, id, mode: ADAPTER_MODES.LOCAL_DRY_RUN, intent };
    },
    dryRun(intent = {}, context = {}) {
      const action = intent.action || (type === "message" ? "message.send" : type === "workflow" ? "workflow.trigger" : "webhook.emit");
      const result = dryRunIntegration({
        action,
        target: id,
        payload: intent.payload || {},
        classification: intent.classification || CLASSIFICATIONS.PUBLIC_SAFE,
      }, {
        confirmed: context.confirmed,
        consent: context.consent,
        requiresConsent: type === "message",
      });
      return { ok: result.dryRun.wouldExecute, id, ...result };
    },
    execute() {
      return { ok: false, id, code: "local_dry_run_execute_disabled", mode: ADAPTER_MODES.LOCAL_DRY_RUN };
    },
  };
}

function liveLifecycle(id, configKey, action) {
  return {
    configure(context = {}) {
      const loaded = loadConfig({ repoRoot: context.repoRoot, configPath: context.configPath });
      const adapterConfig = loaded.config.adapters && loaded.config.adapters[configKey];
      const endpointEnv = adapterConfig && (adapterConfig.endpointEnv || adapterConfig.webhookEnv || adapterConfig.apiKeyEnv || adapterConfig.tokenEnv);
      const configured = Boolean(loaded.ok && endpointEnv && process.env[endpointEnv]);
      return {
        ok: configured,
        id,
        mode: configured ? ADAPTER_MODES.LIVE_READY : ADAPTER_MODES.LIVE_DISABLED,
        missingConfig: configured ? [] : ["local config", endpointEnv || "env var"],
      };
    },
    check(context = {}) {
      return this.configure(context);
    },
    plan(intent = {}, context = {}) {
      const configured = this.configure(context);
      return {
        ok: configured.ok,
        id,
        mode: configured.mode,
        action,
        payloadPreview: intent.payload || {},
        missingConfig: configured.missingConfig || [],
      };
    },
    dryRun(intent = {}, context = {}) {
      const configured = this.configure(context);
      const result = dryRunIntegration({
        action,
        target: id,
        payload: intent.payload || {},
        classification: intent.classification || CLASSIFICATIONS.PUBLIC_SAFE,
      }, {
        confirmed: Boolean(context.confirmed),
        consent: Boolean(context.consent),
        requiresConsent: action.startsWith("message."),
      });
      return { ok: configured.ok && result.dryRun.wouldExecute, id, configured, ...result };
    },
    async execute(intent = {}, context = {}) {
      const dryRun = this.dryRun(intent, context);
      const egress = evaluateEgress(action, {
        payload: intent.payload || {},
        classification: intent.classification || CLASSIFICATIONS.PUBLIC_SAFE,
        dryRunCompleted: Boolean(context.dryRunCompleted),
        idempotencyKey: context.idempotencyKey || (dryRun.dryRun && dryRun.dryRun.idempotencyKey),
        confirmed: Boolean(context.confirmedExternal),
        requiresConsent: action.startsWith("message."),
        consent: Boolean(context.consent),
      });
      if (!dryRun.configured.ok || !egress.ok) {
        return { ok: false, id, code: dryRun.configured.ok ? egress.policy : "live_disabled_by_default", dryRun, egress };
      }
      if (!context.liveHttpEnabled) {
        return { ok: false, id, code: "live_http_disabled", dryRun, egress };
      }
      return requestJson({
        url: context.url,
        method: "POST",
        body: intent.payload || {},
        headers: context.headers || {},
        allowedHosts: context.allowedHosts || ["127.0.0.1", "localhost"],
      });
    },
  };
}

const adapters = [
  createAdapter(descriptor("local-webhook-dry-run", "webhook", ADAPTER_MODES.LOCAL_DRY_RUN, ["webhook.preview", "webhook.emit.dry_run"], { webhook: true }), localDryRunLifecycle("local-webhook-dry-run", "webhook")),
  createAdapter(descriptor("local-n8n-dry-run", "workflow", ADAPTER_MODES.LOCAL_DRY_RUN, ["workflow.list", "workflow.trigger.dry_run", "workflow.status"], { webhook: true }), localDryRunLifecycle("local-n8n-dry-run", "workflow")),
  createAdapter(descriptor("local-message-dry-run", "message", ADAPTER_MODES.LOCAL_DRY_RUN, ["message.preview", "message.send.dry_run", "message.status"], {}), localDryRunLifecycle("local-message-dry-run", "message")),
  createAdapter(descriptor("live-webhook", "webhook-live", ADAPTER_MODES.LIVE_DISABLED, ["webhook.check", "webhook.plan", "webhook.dryRun", "webhook.execute"], { network: true, webhook: true, externalSend: true }, ["ORQUESTRADOR_WEBHOOK_URL"]), liveLifecycle("live-webhook", "webhook", "webhook.emit")),
  createAdapter(descriptor("live-n8n", "workflow-live", ADAPTER_MODES.LIVE_DISABLED, ["n8n.check", "n8n.workflow.plan", "n8n.workflow.dryRun", "n8n.workflow.execute"], { network: true, webhook: true, externalSend: true }, ["ORQUESTRADOR_N8N_WEBHOOK_URL"]), liveLifecycle("live-n8n", "n8n", "workflow.trigger")),
  createAdapter(descriptor("live-whatsapp", "message-live", ADAPTER_MODES.LIVE_DISABLED, ["whatsapp.check", "whatsapp.preview", "whatsapp.dryRun", "whatsapp.execute"], { network: true, externalSend: true }, ["ORQUESTRADOR_WHATSAPP_TOKEN", "ORQUESTRADOR_WHATSAPP_PHONE_ID"]), liveLifecycle("live-whatsapp", "whatsapp", "message.send")),
  createAdapter(descriptor("live-llm", "llm-live", ADAPTER_MODES.LIVE_DISABLED, ["llm.check", "llm.plan", "llm.dryRun", "llm.complete"], { network: true, externalSend: true }, ["ORQUESTRADOR_LLM_API_KEY"]), liveLifecycle("live-llm", "llm", "llm.complete")),
];

const registry = createRegistry(adapters);

function listConnectors(context = {}) {
  return registry.list().map((descriptorValue) => {
    const check = registry.check(descriptorValue.id, context);
    return {
      ...descriptorValue,
      configured: check.ok,
      healthy: check.ok,
      dryRunSupported: descriptorValue.capabilities.some((capability) => /dryRun|dry_run|preview|plan/i.test(capability)),
      liveDisabledByDefault: descriptorValue.mode === ADAPTER_MODES.LIVE_DISABLED && !check.ok,
      missingConfig: check.missingConfig || [],
    };
  });
}

function getConnector(id, context = {}) {
  return listConnectors(context).find((connector) => connector.id === id) || null;
}

function checkConnector(id, context = {}) {
  return registry.check(id, context);
}

function dryRunConnector(id, input = {}, options = {}) {
  return registry.dryRun(id, {
    action: input.action,
    payload: input.payload || {},
    classification: input.classification,
  }, options);
}

function executeConnector(id, input = {}, options = {}) {
  return registry.execute(id, {
    action: input.action,
    payload: input.payload || {},
    classification: input.classification,
  }, options);
}

module.exports = {
  checkConnector,
  dryRunConnector,
  executeConnector,
  getConnector,
  listConnectors,
  registry,
};
