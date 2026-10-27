"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { assertCloudConsent, isCloudTarget } = require("../cloud-consent");
const { DeepSeekGatewayAdapter } = require("../deepseek-adapter");
const { OpenCodeAdapter } = require("../opencode-adapter");

test("local Ollama runs without cloud approval and remote routes require it", () => {
  const localConfig = { provider: { ollama: { options: { baseURL: "http://127.0.0.1:11434/v1" } } } };
  assert.equal(isCloudTarget("opencode", "ollama/llama3.1-maestro:8b", localConfig), false);
  assert.equal(isCloudTarget("opencode", "ollama/llama3.1-maestro:8b", { provider: { ollama: { options: { baseURL: "https://example.com/v1" } } } }), true);
  assert.equal(isCloudTarget("opencode", "ollama/llama3.1-maestro:8b", {}), true);
  for (const providerId of ["claude", "deepseek"]) {
    assert.throws(() => assertCloudConsent([{ providerId }], false), /CLOUD_CONTEXT_APPROVAL_REQUIRED/u);
    assert.doesNotThrow(() => assertCloudConsent([{ providerId }], true));
  }
  assert.throws(() => assertCloudConsent([{ providerId: "opencode", model: "anthropic/claude-sonnet" }], false), /CLOUD_CONTEXT_APPROVAL_REQUIRED/u);
});

test("DeepSeek adapter rejects execution before creating an agent without task approval", async () => {
  const adapter = new DeepSeekGatewayAdapter({ config: { root: "/tmp", stateDir: "/tmp", envFile: "/tmp/key", port: 8765 } });
  await assert.rejects(adapter.execute({ prompt: "teste", workspacePath: "/tmp" }), /CLOUD_CONTEXT_APPROVAL_REQUIRED/u);
});

test("OpenCode adapter rejects direct DeepSeek models that bypass the shared ledger", async () => {
  await assert.rejects(new OpenCodeAdapter().execute({ prompt: "teste", model: "deepseek/deepseek-flash" }), /Use --provider deepseek/u);
});
