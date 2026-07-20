"use strict";

const { hashText, redactValue } = require("../core/security.js");
const { evaluatePolicy } = require("../core/policies.js");

const LOCAL_PROVIDERS = Object.freeze([
  {
    schemaVersion: 1,
    id: "local-llm",
    kind: "llm",
    name: "Local dry-run LLM",
    capabilities: ["llm.complete", "llm.json", "llm.tools"],
    models: [
      { id: "local-fast", contextWindow: 8192, costClass: "free-local" },
      { id: "local-deep", contextWindow: 32768, costClass: "free-local" },
    ],
  },
  {
    schemaVersion: 1,
    id: "live-llm",
    kind: "llm",
    name: "Configured LLM Provider",
    capabilities: ["llm.check", "llm.plan", "llm.dryRun", "llm.complete"],
    mode: "live-disabled",
    models: [],
  },
]);

function listProviders() {
  return LOCAL_PROVIDERS.map((provider) => ({ ...provider }));
}

function checkProviders() {
  return listProviders().map((provider) => ({
    id: provider.id,
    ok: provider.id === "local-llm",
    mode: provider.id === "local-llm" ? "local-dry-run" : "live-disabled",
    models: provider.models.length,
    missingConfig: provider.id === "local-llm" ? [] : ["provider API key env var", "--confirm-external"],
  }));
}

function explainRouting(input = {}) {
  const prompt = input.prompt || "";
  const redacted = redactValue(prompt);
  const model = prompt.length > 4000 ? "local-deep" : "local-fast";
  const policy = evaluatePolicy("llm.complete", {
    classification: redacted.classification,
    external: false,
    persist: false,
    redacted: true,
  });
  return {
    schemaVersion: 1,
    ok: policy.ok,
    provider: "local-llm",
    model,
    promptHash: hashText(prompt),
    redactedPromptPreview: String(redacted.value).slice(0, 160),
    reasons: [
      model === "local-deep" ? "long prompt uses larger local context" : "short prompt uses fast local model",
      "local dry-run provider avoids network and API keys",
    ],
    issues: policy.ok ? [] : [{ code: policy.policy, message: policy.reason }],
  };
}

module.exports = {
  checkProviders,
  explainRouting,
  listProviders,
};
