#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runCli, parseJsonStdout, assertJsonEnvelope, assertExit } = require("./cli-test-harness.js");

function enabled(name) {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] || "").toLowerCase());
}

function requireEnv(names, label) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`${label} sandbox missing env vars: ${missing.join(", ")}`);
  }
}

function allowedHostFromEnv(name) {
  return new URL(process.env[name]).hostname;
}

function writeSandboxConfig(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orquestrador-live-sandbox-"));
  const configPath = path.join(dir, "config.json");
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
}

function parseOk(result) {
  assertExit(result);
  const parsed = assertJsonEnvelope(parseJsonStdout(result));
  assert.equal(parsed.ok, true);
  return parsed;
}

function parseBlockedOrOk(result) {
  const parsed = assertJsonEnvelope(parseJsonStdout(result));
  assert([0, 1].includes(result.status), `unexpected status ${result.status}`);
  return parsed;
}

async function testWhatsAppSandbox() {
  if (!enabled("ORQUESTRADOR_ENABLE_WHATSAPP_SANDBOX_TESTS")) return { skipped: true, name: "whatsapp" };
  requireEnv([
    "ORQUESTRADOR_WHATSAPP_TOKEN",
    "ORQUESTRADOR_WHATSAPP_PHONE_ID",
    "ORQUESTRADOR_WHATSAPP_API_URL",
    "ORQUESTRADOR_WHATSAPP_SANDBOX_RECIPIENT",
  ], "WhatsApp");
  const configPath = writeSandboxConfig({
    schemaVersion: 1,
    adapters: {
      whatsapp: {
        tokenEnv: "ORQUESTRADOR_WHATSAPP_TOKEN",
        phoneIdEnv: "ORQUESTRADOR_WHATSAPP_PHONE_ID",
        endpointEnv: "ORQUESTRADOR_WHATSAPP_API_URL",
        allowedHosts: [allowedHostFromEnv("ORQUESTRADOR_WHATSAPP_API_URL")],
      },
    },
  });
  parseOk(runCli(["whatsapp", "check", "--json", "--config-path", configPath]));
  parseOk(runCli([
    "whatsapp",
    "dry-run",
    "--json",
    "--config-path",
    configPath,
    "--recipient",
    process.env.ORQUESTRADOR_WHATSAPP_SANDBOX_RECIPIENT,
    "--body",
    "Teste sandbox local do Orquestrador Maestro",
    "--idempotency-key",
    `idem_whatsapp_sandbox_${Date.now()}`,
    "--consent",
    "--confirm-external",
  ]));
  if (!enabled("ORQUESTRADOR_LIVE_SANDBOX_SEND")) return { skippedSend: true, name: "whatsapp" };
  parseOk(runCli([
    "whatsapp",
    "send",
    "--json",
    "--config-path",
    configPath,
    "--recipient",
    process.env.ORQUESTRADOR_WHATSAPP_SANDBOX_RECIPIENT,
    "--body",
    "Teste sandbox local do Orquestrador Maestro",
    "--idempotency-key",
    `idem_whatsapp_sandbox_${Date.now()}`,
    "--consent",
    "--confirm-external",
    "--enable-live-http",
  ]));
  return { sent: true, name: "whatsapp" };
}

async function testLlmSandbox() {
  if (!enabled("ORQUESTRADOR_ENABLE_LLM_SANDBOX_TESTS")) return { skipped: true, name: "llm" };
  requireEnv([
    "ORQUESTRADOR_LLM_API_KEY",
    "ORQUESTRADOR_LLM_API_URL",
  ], "LLM");
  const configPath = writeSandboxConfig({
    schemaVersion: 1,
    adapters: {
      llm: {
        provider: process.env.ORQUESTRADOR_LLM_PROVIDER || "sandbox",
        apiKeyEnv: "ORQUESTRADOR_LLM_API_KEY",
        endpointEnv: "ORQUESTRADOR_LLM_API_URL",
        allowedHosts: [allowedHostFromEnv("ORQUESTRADOR_LLM_API_URL")],
      },
    },
  });
  parseOk(runCli(["llm", "live-check", "--json", "--config-path", configPath]));
  parseOk(runCli([
    "llm",
    "dry-run",
    "--json",
    "--config-path",
    configPath,
    "--prompt",
    "Responda apenas: sandbox-ok",
    "--idempotency-key",
    `idem_llm_sandbox_${Date.now()}`,
    "--confirm-external",
  ]));
  if (!enabled("ORQUESTRADOR_LIVE_SANDBOX_SEND")) return { skippedSend: true, name: "llm" };
  const sent = runCli([
    "llm",
    "complete",
    "--json",
    "--config-path",
    configPath,
    "--prompt",
    "Responda apenas: sandbox-ok",
    "--idempotency-key",
    `idem_llm_sandbox_${Date.now()}`,
    "--confirm-external",
    "--enable-live-http",
  ]);
  const parsed = parseBlockedOrOk(sent);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues));
  return { sent: true, name: "llm" };
}

(async () => {
  const results = [await testWhatsAppSandbox(), await testLlmSandbox()];
  console.log(JSON.stringify({ ok: true, results }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
