"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { redactValue } = require("../core/security.js");

const CONFIG_SCHEMA_VERSION = 1;

function defaultConfigPath(repoRoot = process.cwd()) {
  return path.join(repoRoot, ".local", "orquestrador", "config.json");
}

function exampleConfig() {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    adapters: {
      webhook: {
        endpointEnv: "ORQUESTRADOR_WEBHOOK_URL",
        allowedHosts: ["127.0.0.1", "localhost"],
      },
      n8n: {
        webhookEnv: "ORQUESTRADOR_N8N_WEBHOOK_URL",
        allowedHosts: ["127.0.0.1", "localhost"],
      },
      whatsapp: {
        tokenEnv: "ORQUESTRADOR_WHATSAPP_TOKEN",
        phoneIdEnv: "ORQUESTRADOR_WHATSAPP_PHONE_ID",
        endpointEnv: "ORQUESTRADOR_WHATSAPP_API_URL",
        allowedHosts: ["127.0.0.1", "localhost"],
      },
      llm: {
        provider: "mock",
        apiKeyEnv: "ORQUESTRADOR_LLM_API_KEY",
        endpointEnv: "ORQUESTRADOR_LLM_API_URL",
        allowedHosts: ["127.0.0.1", "localhost"],
      },
    },
  };
}

function validateConfig(config) {
  const issues = [];
  if (!config || typeof config !== "object") issues.push("config must be an object");
  else if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) issues.push("schemaVersion must be 1");
  const serialized = JSON.stringify(config || {});
  if (/(api[_-]?key|token|secret|password)"\s*:\s*"(?![A-Z0-9_]+")/i.test(serialized)) {
    issues.push("secret-like values must be referenced by env var name, not stored literally");
  }
  return { ok: issues.length === 0, issues };
}

function loadConfig(options = {}) {
  const configPath = options.configPath || defaultConfigPath(options.repoRoot);
  if (!fs.existsSync(configPath)) {
    return { ok: true, path: configPath, exists: false, config: exampleConfig(), issues: [] };
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const validation = validateConfig(config);
  return { ok: validation.ok, path: configPath, exists: true, config, issues: validation.issues };
}

function writeExampleConfig(options = {}) {
  const configPath = options.configPath || defaultConfigPath(options.repoRoot);
  if (fs.existsSync(configPath) && !options.force) {
    return { ok: false, path: configPath, code: "config_exists" };
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(exampleConfig(), null, 2)}\n`, "utf8");
  return { ok: true, path: configPath };
}

function explainConfig(options = {}) {
  const loaded = loadConfig(options);
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    path: loaded.path,
    exists: loaded.exists,
    ok: loaded.ok,
    issues: loaded.issues,
    redactedConfig: redactValue(loaded.config).value,
  };
}

module.exports = {
  CONFIG_SCHEMA_VERSION,
  defaultConfigPath,
  exampleConfig,
  explainConfig,
  loadConfig,
  validateConfig,
  writeExampleConfig,
};
