"use strict";

const { hashText, redactValue } = require("../core/security.js");
const { evaluatePolicy } = require("../core/policies.js");

const MOCK_PROVIDERS = Object.freeze([
  {
    schemaVersion: 1,
    id: "mock-llm",
    kind: "llm",
    name: "Mock LLM",
    capabilities: ["llm.complete", "llm.json", "llm.tools"],
    models: [
      { id: "mock-fast", contextWindow: 8192, costClass: "free-local" },
      { id: "mock-deep", contextWindow: 32768, costClass: "free-local" },
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
  return MOCK_PROVIDERS.map((provider) => ({ ...provider }));
}

function checkProviders() {
  return listProviders().map((provider) => ({
    id: provider.id,
    ok: provider.id === "mock-llm",
    mode: provider.id === "mock-llm" ? "mock" : "live-disabled",
    models: provider.models.length,
    missingConfig: provider.id === "mock-llm" ? [] : ["provider API key env var", "--confirm-external"],
  }));
}

function explainRouting(input = {}) {
  const prompt = input.prompt || "";
  const redacted = redactValue(prompt);
  const model = prompt.length > 4000 ? "mock-deep" : "mock-fast";
  const policy = evaluatePolicy("llm.complete", {
    classification: redacted.classification,
    external: false,
    persist: false,
    redacted: true,
  });
  return {
    schemaVersion: 1,
    ok: policy.ok,
    provider: "mock-llm",
    model,
    promptHash: hashText(prompt),
    redactedPromptPreview: String(redacted.value).slice(0, 160),
    reasons: [
      model === "mock-deep" ? "long prompt uses larger mock context" : "short prompt uses fast mock model",
      "mock provider avoids network and API keys",
    ],
    issues: policy.ok ? [] : [{ code: policy.policy, message: policy.reason }],
  };
}

module.exports = {
  checkProviders,
  explainRouting,
  listProviders,
};
