"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { assertOpenRouterFreeModel } = require("../openrouter-free-model");
const { OpenCodeAdapter } = require("../opencode-adapter");
const { makeTempDir, writeFile } = require("../../../tests/test-helpers");

const model = "openrouter/example/coding:free";
const entry = { id: "example/coding:free", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] };
const catalog = (data) => async () => ({ ok: true, json: async () => ({ data }) });

test("OpenRouter only admits the exact free model with zero known prices and tools", async () => {
  assert.deepEqual(await assertOpenRouterFreeModel(model, { fetchCatalog: catalog([entry]) }), {
    model, cost: { status: "LIVE", amount: 0 }, quota: { status: "UNKNOWN" }
  });
  for (const denied of [
    { ...entry, id: "example/other:free" },
    { ...entry, pricing: { prompt: "0", completion: "0.001" } },
    { ...entry, pricing: { prompt: "0" } },
    { ...entry, pricing: { prompt: "0", completion: "0", web_search: "0.01" } },
    { ...entry, pricing: { prompt: "0", completion: "0", overrides: [{ min_prompt_tokens: 1000, prompt: "0.01" }] } },
    { ...entry, supported_parameters: [] }
  ]) {
    await assert.rejects(assertOpenRouterFreeModel(model, { fetchCatalog: catalog([denied]) }), /OPENROUTER_(COST|TOOLS)_UNVERIFIED/u);
  }
  await assert.rejects(assertOpenRouterFreeModel("openrouter/example/coding"), /OPENROUTER_FREE_MODEL_REQUIRED/u);
  await assert.rejects(assertOpenRouterFreeModel("openrouter/auto"), /OPENROUTER_FREE_MODEL_REQUIRED/u);
  await assert.rejects(assertOpenRouterFreeModel(model, { fetchCatalog: async () => { throw new Error("offline"); } }), /OPENROUTER_CATALOG_UNAVAILABLE/u);
});

test("OpenCode refuses an unverified OpenRouter route before spawning a process", async () => {
  const adapter = new OpenCodeAdapter({ executable: "/missing/opencode", fetchOpenRouterCatalog: catalog([entry]) });
  await assert.rejects(adapter.execute({ prompt: "teste", model: "openrouter/example/paid" }), /OPENROUTER_FREE_MODEL_REQUIRED/u);
  await assert.rejects(adapter.execute({ prompt: "teste", model, agent: "custom" }), /OPENROUTER_ROUTE_UNVERIFIED/u);
  await assert.rejects(adapter.execute({ prompt: "teste", model, environment: { OPENCODE_CONFIG_CONTENT: "{}" } }), /OPENROUTER_ROUTE_UNVERIFIED/u);
  await assert.rejects(adapter.execute({ prompt: "teste", model, continue: true }), /OPENROUTER_ROUTE_UNVERIFIED/u);
  await assert.rejects(adapter.execute({ prompt: "teste", model, sandbox: "workspace-write" }), /sandbox/iu);
  const freeDeepSeek = "openrouter/deepseek/example:free";
  const deepSeekCatalog = catalog([{ ...entry, id: "deepseek/example:free" }]);
  const direct = new OpenCodeAdapter({ executable: "/missing/opencode", fetchOpenRouterCatalog: deepSeekCatalog });
  const handle = await direct.execute({ prompt: "teste", model: freeDeepSeek });
  assert.match((await handle.result).error, /ENOENT/u);
});

test("OpenRouter execution pins main and auxiliary models and disables provider switching", async () => {
  const root = makeTempDir("maestro-openrouter-");
  const script = writeFile(root, "fake-opencode.js", `
console.log(JSON.stringify({ args: process.argv.slice(2), config: JSON.parse(process.env.OPENCODE_CONFIG_CONTENT) }));
`);
  const adapter = new OpenCodeAdapter({ executable: process.execPath, commandPrefixArgs: [script], fetchOpenRouterCatalog: catalog([entry]) });
  const result = await (await adapter.execute({ prompt: "teste", model, workspacePath: root })).result;
  assert.equal(result.exitCode, 0);
  const received = JSON.parse(result.stdout.trim());
  assert.deepEqual(received.args.slice(0, 5), ["run", "--format", "json", "--model", model]);
  assert.equal(received.config.model, model);
  assert.equal(received.config.small_model, model);
  assert.deepEqual(received.config.enabled_providers, ["openrouter"]);
  assert.equal(received.config.permission.task, "deny");
});
