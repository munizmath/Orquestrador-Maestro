"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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

test("bounded standing mandate covers only authorized providers and safe workspaces", () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-remote-auth-"));
  const authorization = {
    version: 1,
    status: "active",
    authority: "maestro",
    validUntil: "2099-01-01T00:00:00Z",
    providers: ["opencode", "openrouter", "deepseek", "claude", "nexus"],
    workspaceRoots: [workspacePath],
    dataClassesAllowed: ["source-code"]
  };

  assert.doesNotThrow(() => assertCloudConsent([{ providerId: "claude" }], false, { authorization, workspacePath }));
  assert.doesNotThrow(() => assertCloudConsent([{ providerId: "nexus" }], false, { authorization, workspacePath }));
  assert.throws(() => assertCloudConsent([{ providerId: "claude" }], false, { authorization, workspacePath: os.tmpdir() }), /CLOUD_CONTEXT_APPROVAL_REQUIRED/u);

  fs.writeFileSync(path.join(workspacePath, ".env.local"), "SECRET=redacted\n", "utf8");
  assert.throws(() => assertCloudConsent([{ providerId: "claude" }], false, { authorization, workspacePath }), /CLOUD_CONTEXT_APPROVAL_REQUIRED/u);
});

test("DeepSeek adapter rejects execution before creating an agent without task approval", async () => {
  const adapter = new DeepSeekGatewayAdapter({ config: { root: "/tmp", stateDir: "/tmp", envFile: "/tmp/key", port: 8765 } });
  await assert.rejects(adapter.execute({ prompt: "teste", workspacePath: "/tmp" }), /CLOUD_CONTEXT_APPROVAL_REQUIRED/u);
});

test("OpenCode adapter rejects direct DeepSeek models that bypass the shared ledger", async () => {
  await assert.rejects(new OpenCodeAdapter().execute({ prompt: "teste", model: "deepseek/deepseek-flash" }), /Use --provider deepseek/u);
});
