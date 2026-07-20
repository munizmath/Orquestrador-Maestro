"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { defaultConfigPath, explainConfig, validateConfig } = require("../infrastructure/config-loader.js");
const { checkWhatsApp, dryRunWhatsApp } = require("./whatsapp-service.js");
const { checkLlmLive, dryRunLlmLive } = require("./llm-live-service.js");
const { redactValue } = require("../core/security.js");

const ENV_NAMES = Object.freeze({
  waCredential: "ORQUESTRADOR_WHATSAPP_TOKEN",
  waPhoneId: "ORQUESTRADOR_WHATSAPP_PHONE_ID",
  waEndpoint: "ORQUESTRADOR_WHATSAPP_API_URL",
  waRecipient: "ORQUESTRADOR_WHATSAPP_SANDBOX_RECIPIENT",
  llmCredential: "ORQUESTRADOR_LLM_API_KEY",
  llmEndpoint: "ORQUESTRADOR_LLM_API_URL",
});

function commandCheck(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false });
  return {
    command,
    ok: result.status === 0,
    exitCode: typeof result.status === "number" ? result.status : 1,
    preview: String(result.stdout || result.stderr || result.error || "").slice(0, 160),
  };
}

function nodeCheck() {
  return {
    ok: process.platform === "linux" && Number(process.versions.node.split(".")[0]) >= 18,
    platform: process.platform,
    version: process.version,
    execPath: redactValue(process.execPath).value,
  };
}

function buildSetupDoctor(repoRoot, options = {}) {
  const cwd = options.cwd || process.cwd();
  const config = explainConfig({ repoRoot });
  const safeConfig = { ...config, path: redactValue(config.path).value };
  const checks = [
    {
      name: "cwd",
      ok: path.resolve(cwd) === path.resolve(repoRoot),
      recommendation: "Entre na pasta do projeto antes de rodar comandos.",
    },
    {
      name: "user",
      ok: typeof process.getuid !== "function" || process.getuid() !== 0,
      recommendation: "Use o usuario normal do WSL, nao root.",
    },
    {
      name: "node",
      ...nodeCheck(),
      recommendation: "Use Node Linux 18+ dentro do WSL.",
    },
    {
      name: "npm",
      ...commandCheck("npm", ["--version"]),
      recommendation: "Use npm Linux. Se chamar Windows, rode scripts direto com /usr/bin/node.",
    },
    {
      name: "git",
      ...commandCheck("git", ["--version"]),
      recommendation: "Instale git no Ubuntu/WSL se ausente.",
    },
    {
      name: "curl",
      ...commandCheck("curl", ["--version"]),
      recommendation: "Instale curl se quiser diagnosticar endpoints HTTP.",
    },
    {
      name: "config",
      ok: config.ok,
      exists: config.exists,
      recommendation: "Crie .local/orquestrador/config.json pelo setup wizard.",
    },
  ];
  const issues = checks
    .filter((check) => !check.ok)
    .map((check) => ({
      code: `${check.name}_check_failed`,
      message: check.recommendation,
    }));
  return {
    schemaVersion: 1,
    ok: issues.length === 0,
    mode: "local-only",
    home: redactValue(os.homedir()).value,
    repoRoot: redactValue(repoRoot).value,
    config: safeConfig,
    checks,
    issues,
  };
}

function parseEnvFileNames(envPath) {
  if (!fs.existsSync(envPath)) return [];
  return fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*export\s+([A-Z0-9_]+)=/))
    .filter(Boolean)
    .map((match) => match[1]);
}

function envStatus(repoRoot) {
  const envPath = path.join(repoRoot, ".local", "live.env");
  const names = parseEnvFileNames(envPath);
  const status = Object.entries(ENV_NAMES).map(([key, envName]) => ({
    key,
    envName,
    inProcess: Boolean(process.env[envName]),
    inEnvFile: names.includes(envName),
  }));
  return {
    exists: fs.existsSync(envPath),
    path: redactValue(envPath).value,
    variables: status,
    configured: status.filter((item) => item.inProcess || item.inEnvFile).length,
    missing: status.filter((item) => !item.inProcess && !item.inEnvFile).map((item) => item.envName),
  };
}

function fieldStatus(repoRoot) {
  const env = envStatus(repoRoot);
  const byKey = Object.fromEntries(env.variables.map((item) => [item.key, item]));
  const config = explainConfig({ repoRoot });
  const llmProvider = config.redactedConfig &&
    config.redactedConfig.adapters &&
    config.redactedConfig.adapters.llm &&
    config.redactedConfig.adapters.llm.provider;
  return {
    whatsappToken: { configured: Boolean(byKey.waCredential && (byKey.waCredential.inProcess || byKey.waCredential.inEnvFile)), fieldHint: "já configurado localmente, se existir" },
    whatsappPhoneId: { configured: Boolean(byKey.waPhoneId && (byKey.waPhoneId.inProcess || byKey.waPhoneId.inEnvFile)), fieldHint: "já configurado localmente, se existir" },
    whatsappApiUrl: { configured: Boolean(byKey.waEndpoint && (byKey.waEndpoint.inProcess || byKey.waEndpoint.inEnvFile)), fieldHint: "já configurado localmente, se existir" },
    whatsappSandboxRecipient: { configured: Boolean(byKey.waRecipient && (byKey.waRecipient.inProcess || byKey.waRecipient.inEnvFile)), fieldHint: "já configurado localmente, se existir" },
    llmProvider: { configured: Boolean(llmProvider), value: llmProvider || "local" },
    llmApiKey: { configured: Boolean(byKey.llmCredential && (byKey.llmCredential.inProcess || byKey.llmCredential.inEnvFile)), fieldHint: "já configurado localmente, se existir" },
    llmApiUrl: { configured: Boolean(byKey.llmEndpoint && (byKey.llmEndpoint.inProcess || byKey.llmEndpoint.inEnvFile)), fieldHint: "já configurado localmente, se existir" },
  };
}

function buildCopyCommands() {
  return {
    whatsappCheck: "node bin/orquestrador-maestro.js whatsapp check --json",
    whatsappDryRun: [
      "node bin/orquestrador-maestro.js whatsapp dry-run \\",
      "  --recipient \"$ORQUESTRADOR_WHATSAPP_SANDBOX_RECIPIENT\" \\",
      "  --body \"Teste local do Orquestrador Maestro\" \\",
      "  --idempotency-key \"wa-test-$(date +%Y%m%d-%H%M%S)\" \\",
      "  --consent \\",
      "  --confirm-external \\",
      "  --json",
    ].join("\n"),
    whatsappSend: [
      "node bin/orquestrador-maestro.js whatsapp send \\",
      "  --recipient \"$ORQUESTRADOR_WHATSAPP_SANDBOX_RECIPIENT\" \\",
      "  --body \"Teste local do Orquestrador Maestro\" \\",
      "  --idempotency-key \"wa-test-$(date +%Y%m%d-%H%M%S)\" \\",
      "  --consent \\",
      "  --confirm-external \\",
      "  --enable-live-http \\",
      "  --json",
    ].join("\n"),
    llmCheck: "node bin/orquestrador-maestro.js llm live-check --json",
    llmDryRun: [
      "node bin/orquestrador-maestro.js llm dry-run \\",
      "  --prompt \"Responda apenas: ok\" \\",
      "  --budget 1 \\",
      "  --idempotency-key \"llm-test-$(date +%Y%m%d-%H%M%S)\" \\",
      "  --confirm-external \\",
      "  --json",
    ].join("\n"),
  };
}

function friendlySetupIssues(doctor, env) {
  const issues = [...(doctor.issues || [])];
  if (!doctor.config.exists) {
    issues.push({ code: "local_config_missing", message: "Config local ainda nao foi salva. Preencha o wizard e clique em Salvar Config Local." });
  }
  if (!env.exists) {
    issues.push({ code: "local_env_missing", message: "Arquivo .local/live.env ainda nao existe. O wizard cria esse arquivo ao salvar." });
  }
  if (env.exists && env.missing.length > 0) {
    issues.push({ code: "local_env_incomplete", message: "Algumas variaveis ainda faltam. Preencha os campos ausentes ou salve novamente pelo wizard." });
  }
  return issues;
}

function buildWizardStatus(repoRoot, options = {}) {
  const doctor = buildSetupDoctor(repoRoot, options);
  const env = envStatus(repoRoot);
  const issues = friendlySetupIssues(doctor, env);
  return {
    schemaVersion: 1,
    ok: issues.length === 0,
    mode: "local-only",
    doctor,
    env,
    fields: fieldStatus(repoRoot),
    commands: buildCopyCommands(),
    issues,
  };
}

function normalizeHost(endpoint, fallbackHosts = []) {
  if (!endpoint) return fallbackHosts;
  try {
    return Array.from(new Set([new URL(endpoint).hostname, ...fallbackHosts]));
  } catch {
    return fallbackHosts;
  }
}

function buildWizardConfig(input = {}) {
  const whatsappEndpoint = String(input.whatsappApiUrl || "").trim();
  const llmEndpoint = String(input.llmApiUrl || "").trim();
  return {
    schemaVersion: 1,
    adapters: {
      whatsapp: {
        tokenEnv: ENV_NAMES.waCredential,
        phoneIdEnv: ENV_NAMES.waPhoneId,
        endpointEnv: ENV_NAMES.waEndpoint,
        allowedHosts: normalizeHost(whatsappEndpoint, ["graph.facebook.com"]),
      },
      llm: {
        provider: String(input.llmProvider || "local"),
        apiKeyEnv: ENV_NAMES.llmCredential,
        endpointEnv: ENV_NAMES.llmEndpoint,
        allowedHosts: normalizeHost(llmEndpoint, ["127.0.0.1", "localhost"]),
      },
    },
  };
}

function writeLocalConfig(repoRoot, input = {}) {
  const config = buildWizardConfig(input);
  const validation = validateConfig(config);
  if (!validation.ok) {
    return { ok: false, code: "config_invalid", issues: validation.issues };
  }
  const configPath = defaultConfigPath(repoRoot);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return {
    ok: true,
    path: redactValue(configPath).value,
    config: redactValue(config).value,
  };
}

function shellEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
}

function writeLocalEnv(repoRoot, input = {}) {
  const envPath = path.join(repoRoot, ".local", "live.env");
  const lines = [
    [ENV_NAMES.waCredential, input.whatsappToken],
    [ENV_NAMES.waPhoneId, input.whatsappPhoneId],
    [ENV_NAMES.waEndpoint, input.whatsappApiUrl],
    [ENV_NAMES.waRecipient, input.whatsappSandboxRecipient],
    [ENV_NAMES.llmCredential, input.llmApiKey],
    [ENV_NAMES.llmEndpoint, input.llmApiUrl],
  ].filter(([, value]) => String(value || "").length > 0)
    .map(([name, value]) => `export ${name}="${shellEscape(value)}"`);
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(envPath, 0o600);
  } catch {
    // Best-effort on filesystems that do not support chmod.
  }
  return {
    ok: true,
    path: redactValue(envPath).value,
    variablesWritten: lines.length,
  };
}

function applyEnvForProcess(input = {}) {
  const values = {
    waCredential: input.whatsappToken,
    waPhoneId: input.whatsappPhoneId,
    waEndpoint: input.whatsappApiUrl,
    waRecipient: input.whatsappSandboxRecipient,
    llmCredential: input.llmApiKey,
    llmEndpoint: input.llmApiUrl,
  };
  for (const [key, envName] of Object.entries(ENV_NAMES)) {
    if (values[key]) process.env[envName] = String(values[key]);
  }
}

function saveWizardSettings(repoRoot, input = {}) {
  applyEnvForProcess(input);
  const config = writeLocalConfig(repoRoot, input);
  if (!config.ok) return config;
  const env = writeLocalEnv(repoRoot, input);
  return {
    schemaVersion: 1,
    ok: config.ok && env.ok,
    config,
    env,
    nextActions: [
      "Rode source .local/live.env em novos terminais.",
      "Use WhatsApp check e dry-run antes de envio real.",
    ],
  };
}

function buildSupportReport(repoRoot, options = {}) {
  const status = buildWizardStatus(repoRoot, options);
  return {
    schemaVersion: 1,
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: {
      mode: status.mode,
      wizardOk: status.ok,
      issueCodes: status.issues.map((issue) => issue.code),
      envConfigured: status.env.configured,
      envMissing: status.env.missing,
    },
    status,
  };
}

function checkWizardWhatsApp(repoRoot, input = {}) {
  applyEnvForProcess(input);
  return checkWhatsApp({ repoRoot });
}

function dryRunWizardWhatsApp(repoRoot, input = {}) {
  applyEnvForProcess(input);
  return dryRunWhatsApp({
    recipient: input.whatsappSandboxRecipient || "unknown-recipient",
    body: input.body || "Teste local do Orquestrador Maestro",
  }, {
    repoRoot,
    consent: Boolean(input.consent),
    confirmed: true,
    confirmedExternal: Boolean(input.confirmExternal),
    idempotencyKey: input.idempotencyKey || `idem_wizard_whatsapp_${Date.now()}`,
  });
}

function checkWizardLlm(repoRoot, input = {}) {
  applyEnvForProcess(input);
  return checkLlmLive({ repoRoot });
}

function dryRunWizardLlm(repoRoot, input = {}) {
  applyEnvForProcess(input);
  return dryRunLlmLive({
    prompt: input.prompt || "Responda apenas: ok",
    budget: Number(input.budget || 1),
  }, {
    repoRoot,
    confirmed: true,
    confirmedExternal: Boolean(input.confirmExternal),
    idempotencyKey: input.idempotencyKey || `idem_wizard_llm_${Date.now()}`,
  });
}

module.exports = {
  buildSupportReport,
  buildSetupDoctor,
  buildWizardStatus,
  checkWizardLlm,
  checkWizardWhatsApp,
  dryRunWizardLlm,
  dryRunWizardWhatsApp,
  saveWizardSettings,
};
