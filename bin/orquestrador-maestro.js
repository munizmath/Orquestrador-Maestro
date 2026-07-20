#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const packageJson = require(path.join(rootDir, "package.json"));
const { createLocalStore } = require(path.join(rootDir, "src", "infrastructure", "local-store.js"));
const { applyMigrations, planMigrations } = require(path.join(rootDir, "src", "infrastructure", "migrations.js"));
const { getRun, listRuns } = require(path.join(rootDir, "src", "application", "run-registry.js"));
const { buildAlertsViewModel, buildInsightsViewModel, buildSkillsViewModel, buildStatusViewModel } = require(path.join(rootDir, "src", "application", "view-models.js"));
const { validateProject } = require(path.join(rootDir, "src", "application", "validation-service.js"));
const { dryRunIntegration, listCapabilities } = require(path.join(rootDir, "src", "application", "integration-service.js"));
const { checkProviders, explainRouting, listProviders } = require(path.join(rootDir, "src", "application", "llm-service.js"));
const { checkConnector, dryRunConnector, listConnectors } = require(path.join(rootDir, "src", "application", "connector-service.js"));
const { dryRunWorkflowTrigger, listWorkflows } = require(path.join(rootDir, "src", "application", "workflow-service.js"));
const { previewMessage } = require(path.join(rootDir, "src", "application", "message-service.js"));
const { listLiveAdapters } = require(path.join(rootDir, "src", "application", "live-adapters.js"));
const { cancelTask, enqueueTask, listTasks, processQueue, runTask, startQueueWorker } = require(path.join(rootDir, "src", "application", "queue-service.js"));
const { buildMetrics, purgeRuns, retentionPlan } = require(path.join(rootDir, "src", "application", "metrics-service.js"));
const { startServer } = require(path.join(rootDir, "src", "interfaces", "http", "server.js"));
const { exampleConfig, explainConfig, validateConfig, loadConfig, writeExampleConfig } = require(path.join(rootDir, "src", "infrastructure", "config-loader.js"));
const { checkWebhook, dryRunWebhook, sendWebhook } = require(path.join(rootDir, "src", "application", "webhook-service.js"));
const { checkN8n, dryRunN8n, triggerN8n } = require(path.join(rootDir, "src", "application", "n8n-service.js"));
const { checkWhatsApp, dryRunWhatsApp, sendWhatsApp } = require(path.join(rootDir, "src", "application", "whatsapp-service.js"));
const { checkLlmLive, completeLlmLive, dryRunLlmLive } = require(path.join(rootDir, "src", "application", "llm-live-service.js"));
const { buildSetupDoctor } = require(path.join(rootDir, "src", "application", "setup-service.js"));
const telemetryTimeoutMs = 1200;
const telemetryConsentVersion = 1;

const installFlagDefs = {
  "--home-path": { ps: "-HomePath", sh: "--home-path", value: true },
  "--no-force": { ps: "-NoForce", sh: "--no-force" },
  "--no-tool-profiles": { ps: "-NoToolProfiles", sh: "--no-tool-profiles" },
  "--core-only": { ps: "-CoreOnly", sh: "--core-only" },
  "--skip-community-skills": { ps: "-SkipCommunitySkills", sh: "--skip-community-skills" },
  "--skip-skill-sync": { ps: "-SkipSkillSync", sh: "--skip-skill-sync" },
  "--only": { ps: "-Only", sh: "--only", value: true, splitComma: true },
  "--dry-run": { ps: "-DryRun", sh: "--dry-run" },
  "--list-targets": { ps: "-ListTargets", sh: "--list-targets" },
  "--uninstall": { ps: "-Uninstall", sh: "--uninstall" },
  "--non-interactive": { ps: "-NonInteractive", sh: "--non-interactive" },
  "--verbose-paths": { ps: "-VerbosePaths", sh: "--verbose-paths" }
};

const verifyFlagDefs = {
  "--home-path": { ps: "-HomePath", sh: "--home-path", value: true },
  "--skip-tool-profiles": { ps: "-SkipToolProfiles", sh: "--skip-tool-profiles" },
  "--core-only": { ps: "-CoreOnly", sh: "--core-only" },
  "--verbose-paths": { ps: "-VerbosePaths", sh: "--verbose-paths" }
};

const initDevFlagDefs = {
  "--project-path": { ps: "-ProjectPath", sh: "--project-path", value: true }
};

function printHelp() {
  console.log(`Orquestrador Maestro CLI ${packageJson.version}

Uso:
  orquestrador-maestro install [opcoes]
  orquestrador-maestro update [opcoes]
  orquestrador-maestro setup local|doctor [--json] [--dry-run] [--home-path <path>]
  orquestrador-maestro verify [opcoes]
  orquestrador-maestro validate [--json] [--check-sync]
  orquestrador-maestro skills list [--json]
  orquestrador-maestro skills check [--json] [--check-sync]
  orquestrador-maestro health local [--json]
  orquestrador-maestro status [--json] [--state-dir <path>]
  orquestrador-maestro doctor [--home-path <path>]
  orquestrador-maestro insights [--json] [--state-dir <path>]
  orquestrador-maestro local migrate [--dry-run|--apply] [--json] [--state-dir <path>]
  orquestrador-maestro runs list|show <id> [--json] [--state-dir <path>]
  orquestrador-maestro server start [--port <n>] [--host <host>]
  orquestrador-maestro panel path
  orquestrador-maestro integrations capabilities|dry-run [--json]
  orquestrador-maestro llm providers|check|explain-routing [--json]
  orquestrador-maestro connectors list|check|dry-run [--json]
  orquestrador-maestro workflows list|dry-run [--json]
  orquestrador-maestro messages preview [--json]
  orquestrador-maestro queue list|enqueue|run|cancel|work [--json]
  orquestrador-maestro metrics summary|retention|purge [--json]
  orquestrador-maestro adapters live [--json]
  orquestrador-maestro config validate|explain|example|init [--json]
  orquestrador-maestro webhook check|dry-run|send [--json]
  orquestrador-maestro n8n check|dry-run|trigger [--json]
  orquestrador-maestro whatsapp check|dry-run|send [--json]
  orquestrador-maestro init-dev [--project-path PATH]
  orquestrador-maestro compact-worklog [--project-path PATH] [--keep N]
  orquestrador-maestro check-dev-gates [--project-path PATH] [--max-entries N] [--strict]
  orquestrador-maestro changelog [--full]
  orquestrador-maestro uninstall [opcoes]
  orquestrador-maestro list-targets [opcoes]
  orquestrador-maestro dry-run [opcoes]
  orquestrador-maestro telemetry [status|enable|disable|endpoint|test]
  orquestrador-maestro version

Opcoes de install/update/uninstall:
  --home-path <path>          Instala em outro home para teste
  --core-only                 Instala somente .orquestrador e AGENTS.md
  --only <component>          Limita a um componente: core, codex, agents,
                              claude, opencode, cursor, gemini, windsurf,
                              antigravity
  --no-tool-profiles          Nao instala perfis globais das ferramentas
  --skip-community-skills     Nao copia a biblioteca comunitaria offload
  --skip-skill-sync           Nao roda o sync de skills
  --dry-run                   Mostra o plano sem alterar arquivos
  --list-targets              Lista os destinos conhecidos
  --non-interactive           Evita prompts interativos
  --verbose-paths             Mostra caminhos reais nos relatorios

Opcoes de verify:
  --home-path <path>
  --core-only
  --skip-tool-profiles
  --verbose-paths

Opcoes de validate/skills/health:
  --json                    Emite saida JSON quando suportado
  --check-sync              Confere espelho entre orquestrador/skills e codex/skills

Opcoes de setup local:
  --json                    Emite um relatorio JSON consolidado
  --dry-run                 Diagnostica sem instalar/sincronizar
  --home-path <path>        Usa outro home para teste

Opcoes de local migrate:
  --dry-run                 Mostra migracoes sem alterar disco
  --apply                   Aplica migracoes locais
  --state-dir <path>        Usa outro diretorio de estado para teste
  --json                    Emite envelope JSON estavel

Opcoes de runs:
  --state-dir <path>        Usa outro diretorio de estado para teste
  --json                    Emite envelope JSON estavel

Opcoes de server:
  --port <n>                Porta local. Use 0 para porta aleatoria
  --host <host>             127.0.0.1 por padrao. 0.0.0.0 apenas em container

Opcoes de integrations dry-run:
  --action <name>           Acao, ex: webhook.emit
  --target <id>             Destino logico, ex: local-webhook-dry-run
  --payload-json <json>     Payload seguro de teste
  --confirmed               Simula confirmacao explicita
  --consent                 Simula consentimento do canal

Opcoes de llm explain-routing:
  --prompt <text>           Prompt para explicar roteamento local

Opcoes de doctor:
  --home-path <path>          Diagnostica outro home

Opcoes de init-dev:
  --project-path <path>       Cria a hierarquia DEV recomendada no projeto

Opcoes de compact-worklog:
  --project-path <path>       Projeto que contem DEV/WORKLOG.md
  --keep <n>                  Mantem as N entradas mais recentes no WORKLOG

Opcoes de check-dev-gates:
  --project-path <path>       Projeto que contem a hierarquia DEV
  --max-entries <n>           Falha se DEV/WORKLOG.md passar do limite
  --strict                    Exige entrada substantiva e bullets minimos

Opcoes de changelog:
  --full                      Mostra o historico completo embutido no pacote

Exemplos:
  npm install -g @iapro/orquestrador-maestro-cli
  orquestrador-maestro install
  orquestrador-maestro verify
  orquestrador-maestro validate --check-sync
  orquestrador-maestro skills list
  orquestrador-maestro health local
  orquestrador-maestro status
  orquestrador-maestro local migrate --dry-run
  orquestrador-maestro runs list
  orquestrador-maestro server start --port 8787
  orquestrador-maestro changelog
  npm update -g @iapro/orquestrador-maestro-cli
  orquestrador-maestro update
  orquestrador-maestro doctor
  orquestrador-maestro init-dev --project-path .
  orquestrador-maestro compact-worklog --project-path . --keep 12
  orquestrador-maestro check-dev-gates --project-path . --strict
`);
}

function normalizeArgs(args) {
  return args.flatMap((arg) => {
    if (arg.startsWith("--") && arg.includes("=")) {
      const index = arg.indexOf("=");
      return [arg.slice(0, index), arg.slice(index + 1)];
    }
    return [arg];
  });
}

function translateArgs(args, defs, target) {
  const normalized = normalizeArgs(args);
  const translated = [];
  const arrayValues = new Map();

  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    const def = defs[arg];
    if (!def) {
      throw new Error(`Parametro desconhecido: ${arg}`);
    }

    if (def.value) {
      const value = normalized[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Parametro ${arg} exige um valor.`);
      }
      const values = def.splitComma
        ? value.split(/[,\s]+/).map((entry) => entry.trim()).filter(Boolean)
        : [value];
      if (values.length === 0) {
        throw new Error(`Parametro ${arg} exige um valor.`);
      }
      if (def.splitComma && target === "ps") {
        const collected = arrayValues.get(arg) || [];
        collected.push(...values);
        arrayValues.set(arg, collected);
      } else if (def.splitComma) {
        for (const item of values) {
          translated.push(def[target], item);
        }
      } else {
        translated.push(def[target], value);
      }
      i += 1;
    } else {
      translated.push(def[target]);
    }
  }

  for (const [arg, values] of arrayValues.entries()) {
    translated.push(defs[arg][target], values.join(","));
  }

  return translated;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  return typeof result.status === "number" ? result.status : 1;
}

function runCaptured(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    shell: false
  });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}

function runNodeScript(scriptName, args = []) {
  const script = path.join(rootDir, "scripts", scriptName);
  if (!commandExists(script)) {
    throw new Error(`Script nao encontrado: ${script}`);
  }
  return run(process.execPath, [script, ...args]);
}

function buildInstallInvocation(args, injectedFlags = []) {
  const isWindows = process.platform === "win32";
  const script = path.join(rootDir, isWindows ? "install.ps1" : "install.sh");
  if (!commandExists(script)) {
    throw new Error(`Instalador nao encontrado: ${script}`);
  }
  if (isWindows) {
    const translated = translateArgs([...args, ...injectedFlags], installFlagDefs, "ps");
    return { command: "powershell", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...translated] };
  }
  const translated = translateArgs([...args, ...injectedFlags], installFlagDefs, "sh");
  return { command: "bash", args: [script, ...translated] };
}

function commandExists(filePath) {
  return fs.existsSync(filePath);
}

function runInstall(args, injectedFlags = []) {
  const invocation = buildInstallInvocation(args, injectedFlags);
  return run(invocation.command, invocation.args);
}

function runVerify(args) {
  const isWindows = process.platform === "win32";
  const script = path.join(rootDir, "scripts", isWindows ? "verify-install.ps1" : "verify-install.sh");
  if (!commandExists(script)) {
    throw new Error(`Verificador nao encontrado: ${script}`);
  }

  if (isWindows) {
    const translated = translateArgs(args, verifyFlagDefs, "ps");
    return run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...translated]);
  }

  const translated = translateArgs(args, verifyFlagDefs, "sh");
  return run("bash", [script, ...translated]);
}

function runValidateCommand(args) {
  const allowed = new Set(["--json", "--check-sync"]);
  for (const arg of args) {
    if (!allowed.has(arg)) throw new Error(`Parametro desconhecido para validate: ${arg}`);
  }
  return runNodeScript("run-validate.js", args);
}

function runSkillsCommand(args) {
  const [subcommand = "list", ...rest] = args;
  if (subcommand === "list") {
    return runNodeScript("skill-catalog.js", ["list", ...rest]);
  }
  if (subcommand === "check" || subcommand === "validate") {
    return runNodeScript("skill-catalog.js", ["validate", ...rest]);
  }
  throw new Error(`Subcomando de skills desconhecido: ${subcommand}`);
}

function runHealthCommand(args) {
  const [subcommand = "local", ...rest] = args;
  if (subcommand !== "local") {
    throw new Error(`Subcomando de health desconhecido: ${subcommand}`);
  }
  return runNodeScript("local-health.js", rest);
}

function parseSetupLocalArgs(args) {
  const normalized = normalizeArgs(args);
  const options = {
    json: false,
    dryRun: false,
    homePath: null,
  };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--home-path") {
      const value = normalized[i + 1];
      if (!value || value.startsWith("--")) throw new Error("Parametro --home-path exige um valor.");
      options.homePath = value;
      i += 1;
      continue;
    }
    throw new Error(`Parametro desconhecido para setup local: ${arg}`);
  }
  return options;
}

function setupStep(name, command, args, options = {}) {
  const result = options.capture ? runCaptured(command, args) : { status: run(command, args), stdout: "", stderr: "", error: null };
  return {
    name,
    ok: result.status === 0,
    exitCode: result.status,
    stdoutPreview: String(result.stdout || "").slice(0, 1200),
    stderrPreview: String(result.stderr || "").slice(0, 1200),
    error: result.error,
  };
}

function runSetupCommand(args) {
  const [subcommand = "local", ...rest] = args;
  if (subcommand === "doctor") {
    const options = parseStatefulArgs(rest);
    const data = buildSetupDoctor(rootDir, { cwd: process.cwd() });
    if (options.json) emitEnvelope("setup doctor", options, data, data.issues || []);
    else {
      console.log(data.ok ? "Setup doctor passed." : "Setup doctor found issues.");
      for (const check of data.checks) console.log(`${check.ok ? "ok" : "fail"}\t${check.name}`);
      for (const issue of data.issues) console.log(`- ${issue.message}`);
    }
    return data.ok ? 0 : 1;
  }
  if (subcommand !== "local") throw new Error(`Subcomando de setup desconhecido: ${subcommand}`);
  const options = parseSetupLocalArgs(rest);
  const capture = options.json;
  const installArgs = ["--non-interactive"];
  if (options.homePath) installArgs.push("--home-path", options.homePath);
  const installInvocation = buildInstallInvocation(installArgs, options.dryRun ? ["--dry-run"] : []);
  const steps = [
    setupStep(options.dryRun ? "install-plan" : "install-sync", installInvocation.command, installInvocation.args, { capture }),
    setupStep("validate", process.execPath, [path.join(rootDir, "scripts", "run-validate.js"), "--check-sync"], { capture }),
    setupStep("health-local", process.execPath, [path.join(rootDir, "scripts", "local-health.js")], { capture }),
    setupStep("doctor", process.execPath, [path.join(rootDir, "bin", "orquestrador-maestro.js"), "doctor", "--json"], { capture: true }),
  ];
  if (!options.dryRun) {
    const verifyArgs = [];
    if (options.homePath) verifyArgs.push("--home-path", options.homePath);
    const verifyInvocation = process.platform === "win32"
      ? { command: "powershell", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(rootDir, "scripts", "verify-install.ps1"), ...translateArgs(verifyArgs, verifyFlagDefs, "ps")] }
      : { command: "bash", args: [path.join(rootDir, "scripts", "verify-install.sh"), ...translateArgs(verifyArgs, verifyFlagDefs, "sh")] };
    steps.splice(1, 0, setupStep("verify", verifyInvocation.command, verifyInvocation.args, { capture }));
  }
  const data = {
    schemaVersion: 1,
    mode: "local-only",
    dryRun: options.dryRun,
    steps,
    ok: steps.every((step) => step.ok),
  };
  if (options.json) {
    emitEnvelope("setup local", options, data, data.ok ? [] : steps.filter((step) => !step.ok).map((step) => ({ code: `${step.name}_failed`, message: `${step.name} failed` })));
    return data.ok ? 0 : 1;
  }
  for (const step of steps) console.log(`${step.ok ? "ok" : "fail"}\t${step.name}`);
  return data.ok ? 0 : 1;
}

function parseLocalMigrateArgs(args) {
  const normalized = normalizeArgs(args);
  const options = {
    dryRun: false,
    apply: false,
    json: false,
    stateDir: null,
  };

  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--state-dir") {
      const value = normalized[i + 1];
      if (!value || value.startsWith("--")) throw new Error("Parametro --state-dir exige um valor.");
      options.stateDir = path.resolve(value);
      i += 1;
      continue;
    }
    throw new Error(`Parametro desconhecido para local migrate: ${arg}`);
  }

  if (options.dryRun && options.apply) {
    throw new Error("Use apenas um: --dry-run ou --apply.");
  }
  if (!options.dryRun && !options.apply) {
    options.dryRun = true;
  }
  return options;
}

function emitLocalResult(command, options, plan) {
  if (options.json) {
    console.log(JSON.stringify({
      ok: Boolean(plan.ok),
      command,
      timestamp: new Date().toISOString(),
      durationMs: 0,
      data: plan,
      issues: plan.issues || [],
      warnings: [],
    }, null, 2));
    return;
  }

  if (!plan.ok) {
    console.error(`Migracao local bloqueada: ${(plan.issues || []).join("; ")}`);
    return;
  }

  if (options.dryRun) {
    console.log(`Migracao local dry-run: ${plan.actions.length} acao(oes) pendente(s).`);
    for (const action of plan.actions) console.log(`  - ${action.type}: ${action.path}`);
    return;
  }

  console.log(`Migracao local aplicada: ${plan.applied || 0} acao(oes).`);
}

function parseStatefulArgs(args, allowedFlags = []) {
  const normalized = normalizeArgs(args);
  const allowed = new Set(["--json", "--state-dir", ...allowedFlags]);
  const options = { json: false, stateDir: null, rest: [] };

  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--state-dir") {
      const value = normalized[i + 1];
      if (!value || value.startsWith("--")) throw new Error("Parametro --state-dir exige um valor.");
      options.stateDir = path.resolve(value);
      i += 1;
      continue;
    }
    if (arg.startsWith("--") && !allowed.has(arg)) {
      throw new Error(`Parametro desconhecido: ${arg}`);
    }
    options.rest.push(arg);
  }
  return options;
}

function emitEnvelope(command, options, data, issues = [], warnings = []) {
  const ok = issues.length === 0;
  if (options.json) {
    console.log(JSON.stringify({
      ok,
      command,
      timestamp: new Date().toISOString(),
      durationMs: 0,
      data,
      issues,
      warnings,
    }, null, 2));
    return;
  }
  return null;
}

function runLocalCommand(args) {
  const [subcommand = "migrate", ...rest] = args;
  if (subcommand !== "migrate") {
    throw new Error(`Subcomando local desconhecido: ${subcommand}`);
  }
  const options = parseLocalMigrateArgs(rest);
  const store = createLocalStore({ repoRoot: rootDir, rootDir: options.stateDir || undefined });
  const plan = options.apply ? applyMigrations(store) : planMigrations(store);
  emitLocalResult("local migrate", options, plan);
  return plan.ok ? 0 : 1;
}

function runRunsCommand(args) {
  const [subcommand = "list", ...rest] = args;
  const options = parseStatefulArgs(rest);
  const store = createLocalStore({ repoRoot: rootDir, rootDir: options.stateDir || undefined });

  if (subcommand === "list") {
    const runs = listRuns(store);
    if (options.json) {
      emitEnvelope("runs list", options, { runs });
      return 0;
    }
    if (runs.length === 0) {
      console.log("Nenhum run local registrado.");
      return 0;
    }
    for (const run of runs) {
      console.log(`${run.id}  ${run.status}  ${run.kind}  ${run.startedAt}  ${run.summary}`);
    }
    return 0;
  }

  if (subcommand === "show") {
    const [runId] = options.rest;
    if (!runId) throw new Error("Informe o id do run.");
    const run = getRun(store, runId);
    if (!run) {
      const issues = [{ severity: "error", code: "run_not_found", message: `Run nao encontrado: ${runId}` }];
      emitEnvelope("runs show", options, null, issues);
      if (!options.json) console.error(issues[0].message);
      return 1;
    }
    if (options.json) {
      emitEnvelope("runs show", options, { run });
      return 0;
    }
    console.log(JSON.stringify(run, null, 2));
    return 0;
  }

  throw new Error(`Subcomando de runs desconhecido: ${subcommand}`);
}

function runStatusCommand(args) {
  const options = parseStatefulArgs(args);
  const store = createLocalStore({ repoRoot: rootDir, rootDir: options.stateDir || undefined });
  const status = buildStatusViewModel(rootDir, { store });
  if (options.json) {
    emitEnvelope("status", options, status, status.ok ? [] : status.issues, status.warnings);
    return status.ok ? 0 : 1;
  }
  console.log(status.ok ? "Orquestrador pronto para uso local." : "Orquestrador requer atencao.");
  console.log(`Modo: ${status.mode}`);
  console.log(`Skills: ${status.health.skills}`);
  console.log(`Runs: ${status.health.runs}`);
  if (status.issues.length > 0) {
    for (const item of status.issues.slice(0, 10)) console.log(`- ${item.message}`);
  }
  return status.ok ? 0 : 1;
}

function runInsightsCommand(args) {
  const options = parseStatefulArgs(args);
  const store = createLocalStore({ repoRoot: rootDir, rootDir: options.stateDir || undefined });
  const insights = buildInsightsViewModel(rootDir, { store });
  if (options.json) {
    emitEnvelope("insights", options, insights);
    return 0;
  }
  console.log(`Runs: ${insights.runs.total}`);
  console.log(`Duracao media: ${insights.runs.averageDurationMs}ms`);
  console.log(`Skills: ${insights.skills.total}`);
  return 0;
}

function valueAfter(args, name, fallback = null) {
  const normalized = normalizeArgs(args);
  const index = normalized.indexOf(name);
  if (index === -1) return fallback;
  const value = normalized[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Parametro ${name} exige um valor.`);
  return value;
}

async function runServerCommand(args) {
  const [subcommand = "start", ...rest] = args;
  if (subcommand !== "start") throw new Error(`Subcomando de server desconhecido: ${subcommand}`);
  const port = Number(valueAfter(rest, "--port", "8787"));
  const host = valueAfter(rest, "--host", "127.0.0.1");
  const server = await startServer({ repoRoot: rootDir, port, host });
  const address = server.address();
  console.log(`API local em http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${address.port}`);
  return new Promise(() => {});
}

function runPanelCommand(args) {
  const [subcommand = "path"] = args;
  if (subcommand !== "path") throw new Error(`Subcomando de panel desconhecido: ${subcommand}`);
  console.log(path.join(rootDir, "src", "interfaces", "panel", "index.html"));
  return 0;
}

function parsePayloadJson(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Payload JSON invalido: ${error.message}`);
  }
}

function runIntegrationsCommand(args) {
  const [subcommand = "capabilities", ...rest] = args;
  const options = parseStatefulArgs(rest, ["--action", "--target", "--payload-json", "--confirmed", "--consent"]);
  if (subcommand === "capabilities") {
    const data = { schemaVersion: 1, capabilities: listCapabilities() };
    if (options.json) emitEnvelope("integrations capabilities", options, data);
    else for (const capability of data.capabilities) console.log(`${capability.name}\t${capability.mode}`);
    return 0;
  }
  if (subcommand === "dry-run") {
    const action = valueAfter(rest, "--action", "webhook.emit");
    const target = valueAfter(rest, "--target", "local-webhook-dry-run");
    const payload = parsePayloadJson(valueAfter(rest, "--payload-json", "{}"));
    const result = dryRunIntegration({
      action,
      target,
      payload,
    }, {
      confirmed: rest.includes("--confirmed"),
      consent: rest.includes("--consent"),
      requiresConsent: action.startsWith("message."),
    });
    if (options.json) emitEnvelope("integrations dry-run", options, result);
    else {
      console.log(result.dryRun.wouldExecute ? "Dry-run permitido." : "Dry-run bloqueado.");
      console.log(`Idempotency: ${result.dryRun.idempotencyKey}`);
    }
    return result.dryRun.wouldExecute ? 0 : 1;
  }
  throw new Error(`Subcomando de integrations desconhecido: ${subcommand}`);
}

async function runLlmCommand(args) {
  const [subcommand = "providers", ...rest] = args;
  const options = parseStatefulArgs(rest, ["--prompt"]);
  if (subcommand === "providers") {
    const data = { schemaVersion: 1, providers: listProviders() };
    if (options.json) emitEnvelope("llm providers", options, data);
    else for (const provider of data.providers) console.log(`${provider.id}\t${provider.models.length} modelos\t${provider.id.startsWith("local-") ? "local-dry-run" : "live"}`);
    return 0;
  }
  if (subcommand === "check") {
    const data = { schemaVersion: 1, checks: checkProviders() };
    const hardFailures = data.checks.filter((check) => !check.ok && check.mode !== "live-disabled");
    const warnings = data.checks.filter((check) => !check.ok && check.mode === "live-disabled");
    if (options.json) emitEnvelope("llm check", options, data, hardFailures, warnings);
    else for (const check of data.checks) console.log(`${check.ok ? "ok" : "fail"}\t${check.id}`);
    return hardFailures.length === 0 ? 0 : 1;
  }
  if (subcommand === "explain-routing") {
    const data = explainRouting({ prompt: valueAfter(rest, "--prompt", "") });
    if (options.json) emitEnvelope("llm explain-routing", options, data, data.ok ? [] : data.issues);
    else {
      console.log(`${data.provider}/${data.model}`);
      for (const reason of data.reasons) console.log(`- ${reason}`);
    }
    return data.ok ? 0 : 1;
  }
  if (subcommand === "live-check") {
    const optionsLive = parseStatefulArgs(rest, ["--config-path"]);
    const data = checkLlmLive({ repoRoot: rootDir, configPath: valueAfter(rest, "--config-path", null) });
    if (optionsLive.json) emitEnvelope("llm live-check", optionsLive, data, data.ok ? [] : [{ code: "llm_not_configured", message: "llm_not_configured" }]);
    else console.log(data.ok ? "llm live-ready" : `llm ${data.mode}`);
    return data.ok ? 0 : 1;
  }
  if (subcommand === "dry-run" || subcommand === "complete") {
    const optionsLive = parseStatefulArgs(rest, ["--config-path", "--prompt", "--model", "--budget", "--idempotency-key", "--confirm-external", "--enable-live-http"]);
    const context = {
      repoRoot: rootDir,
      configPath: valueAfter(rest, "--config-path", null),
      idempotencyKey: valueAfter(rest, "--idempotency-key", null),
      confirmedExternal: rest.includes("--confirm-external"),
      liveHttpEnabled: rest.includes("--enable-live-http"),
    };
    const input = {
      prompt: valueAfter(rest, "--prompt", ""),
      model: valueAfter(rest, "--model", "configured-default"),
      budget: Number(valueAfter(rest, "--budget", "1")),
    };
    const data = subcommand === "dry-run"
      ? dryRunLlmLive(input, { ...context, confirmed: true })
      : await completeLlmLive(input, { ...context, dryRunCompleted: true, confirmed: true });
    if (optionsLive.json) emitEnvelope(`llm ${subcommand}`, optionsLive, data, data.ok ? [] : [{ code: data.code || `llm_${subcommand}_blocked`, message: data.code || `llm_${subcommand}_blocked` }]);
    else console.log(data.ok ? `llm ${subcommand} ok` : `llm ${subcommand} blocked`);
    return data.ok ? 0 : 1;
  }
  throw new Error(`Subcomando de llm desconhecido: ${subcommand}`);
}

function runConnectorsCommand(args) {
  const [subcommand = "list", ...rest] = args;
  const options = parseStatefulArgs(rest, ["--id", "--payload-json", "--confirmed", "--consent"]);
  if (subcommand === "list") {
    const data = { schemaVersion: 1, connectors: listConnectors() };
    if (options.json) emitEnvelope("connectors list", options, data);
    else for (const connector of data.connectors) console.log(`${connector.id}\t${connector.type}\t${connector.healthy ? "ok" : "disabled"}`);
    return 0;
  }
  const id = valueAfter(rest, "--id", "local-webhook-dry-run");
  if (subcommand === "check") {
    const data = checkConnector(id);
    const code = data.code || (data.mode === "live-disabled" ? "live_disabled" : "connector_check_failed");
    if (options.json) emitEnvelope("connectors check", options, data, data.ok ? [] : [{ code, message: code }]);
    else console.log(data.ok ? `ok\t${id}` : `blocked\t${id}\t${data.code}`);
    return data.ok ? 0 : 1;
  }
  if (subcommand === "dry-run") {
    const data = dryRunConnector(id, {
      payload: parsePayloadJson(valueAfter(rest, "--payload-json", "{}")),
    }, {
      confirmed: rest.includes("--confirmed"),
      consent: rest.includes("--consent"),
    });
    if (options.json) emitEnvelope("connectors dry-run", options, data, data.ok ? [] : [{ code: data.code || "dry_run_blocked", message: data.code || "dry-run blocked" }]);
    else console.log(data.ok ? `dry-run ok\t${id}` : `dry-run blocked\t${id}`);
    return data.ok ? 0 : 1;
  }
  throw new Error(`Subcomando de connectors desconhecido: ${subcommand}`);
}

function runWorkflowsCommand(args) {
  const [subcommand = "list", ...rest] = args;
  const options = parseStatefulArgs(rest, ["--workflow-id", "--payload-json"]);
  if (subcommand === "list") {
    const data = { schemaVersion: 1, workflows: listWorkflows() };
    if (options.json) emitEnvelope("workflows list", options, data);
    else for (const workflow of data.workflows) console.log(`${workflow.id}\t${workflow.status}\t${workflow.name}`);
    return 0;
  }
  if (subcommand === "dry-run") {
    const workflowId = valueAfter(rest, "--workflow-id", "wf_local_onboarding");
    const data = dryRunWorkflowTrigger(workflowId, parsePayloadJson(valueAfter(rest, "--payload-json", "{}")));
    if (options.json) emitEnvelope("workflows dry-run", options, data, data.ok ? [] : [{ code: data.code, message: data.code }]);
    else console.log(data.ok ? `workflow dry-run ok\t${workflowId}` : `workflow dry-run blocked\t${workflowId}`);
    return data.ok ? 0 : 1;
  }
  throw new Error(`Subcomando de workflows desconhecido: ${subcommand}`);
}

function runMessagesCommand(args) {
  const [subcommand = "preview", ...rest] = args;
  const options = parseStatefulArgs(rest, ["--recipient", "--body", "--consent"]);
  if (subcommand !== "preview") throw new Error(`Subcomando de messages desconhecido: ${subcommand}`);
  const data = previewMessage({
    recipient: valueAfter(rest, "--recipient", "unknown-recipient"),
    body: valueAfter(rest, "--body", "Mensagem de teste"),
    consent: rest.includes("--consent"),
  });
  if (options.json) emitEnvelope("messages preview", options, data, data.ok ? [] : [{ code: "message_preview_blocked", message: "message preview blocked" }]);
  else console.log(data.ok ? `preview ok\t${data.recipientRef}` : `preview blocked\t${data.recipientRef}`);
  return data.ok ? 0 : 1;
}

function runQueueCommand(args) {
  const [subcommand = "list", ...rest] = args;
  const options = parseStatefulArgs(rest, ["--type", "--id", "--limit", "--concurrency", "--interval-ms"]);
  const store = createLocalStore({ repoRoot: rootDir, rootDir: options.stateDir || undefined });
  if (subcommand === "list") {
    const data = { schemaVersion: 1, tasks: listTasks(store) };
    if (options.json) emitEnvelope("queue list", options, data);
    else for (const task of data.tasks) console.log(`${task.taskId}\t${task.status}\t${task.kind}`);
    return 0;
  }
  if (subcommand === "enqueue") {
    const data = enqueueTask(store, { type: valueAfter(rest, "--type", "validate") });
    if (options.json) emitEnvelope("queue enqueue", options, data);
    else console.log(`${data.taskId}\t${data.status}`);
    return 0;
  }
  const id = valueAfter(rest, "--id");
  if (subcommand === "run") {
    const data = runTask(store, id, { repoRoot: rootDir });
    if (options.json) emitEnvelope("queue run", options, data);
    else console.log(`${data.taskId}\t${data.status}`);
    return 0;
  }
  if (subcommand === "work") {
    const limit = Number(valueAfter(rest, "--concurrency", valueAfter(rest, "--limit", "1")));
    if (rest.includes("--once")) {
      const data = processQueue(store, { repoRoot: rootDir, concurrency: limit });
      if (options.json) emitEnvelope("queue work", options, data);
      else console.log(`processed=${data.processed}`);
      return 0;
    }
    const intervalMs = Number(valueAfter(rest, "--interval-ms", "1000"));
    startQueueWorker(store, { repoRoot: rootDir, concurrency: limit, intervalMs });
    console.log(`queue worker running\tintervalMs=${intervalMs}\tconcurrency=${limit}`);
    process.stdin.resume();
    return 0;
  }
  if (subcommand === "cancel") {
    const data = cancelTask(store, id);
    if (options.json) emitEnvelope("queue cancel", options, data);
    else console.log(`${data.taskId}\t${data.status}`);
    return 0;
  }
  throw new Error(`Subcomando de queue desconhecido: ${subcommand}`);
}

function runMetricsCommand(args) {
  const [subcommand = "summary", ...rest] = args;
  const options = parseStatefulArgs(rest, ["--older-than-days", "--apply"]);
  const store = createLocalStore({ repoRoot: rootDir, rootDir: options.stateDir || undefined });
  if (subcommand === "summary") {
    const data = buildMetrics(store);
    if (options.json) emitEnvelope("metrics summary", options, data);
    else console.log(`runs=${data.runs.total} audit=${data.audit.total}`);
    return 0;
  }
  const olderThanDays = Number(valueAfter(rest, "--older-than-days", "30"));
  if (subcommand === "retention") {
    const data = retentionPlan(store, olderThanDays);
    if (options.json) emitEnvelope("metrics retention", options, data);
    else console.log(`${data.candidates.length} run(s) candidates for purge`);
    return 0;
  }
  if (subcommand === "purge") {
    const data = purgeRuns(store, olderThanDays, { dryRun: !rest.includes("--apply") });
    if (options.json) emitEnvelope("metrics purge", options, data);
    else console.log(`${data.dryRun ? "dry-run" : "purged"}\t${data.purged}`);
    return 0;
  }
  throw new Error(`Subcomando de metrics desconhecido: ${subcommand}`);
}

function runAdaptersCommand(args) {
  const [subcommand = "live", ...rest] = args;
  const options = parseStatefulArgs(rest);
  if (subcommand !== "live") throw new Error(`Subcomando de adapters desconhecido: ${subcommand}`);
  const data = { schemaVersion: 1, adapters: listLiveAdapters().map((adapter) => adapter.execute()) };
  if (options.json) emitEnvelope("adapters live", options, data);
  else for (const adapter of data.adapters) console.log(`blocked\t${adapter.code}`);
  return 0;
}

function runConfigCommand(args) {
  const [subcommand = "validate", ...rest] = args;
  const options = parseStatefulArgs(rest, ["--config-path", "--force"]);
  const configPath = valueAfter(rest, "--config-path", null);
  if (subcommand === "example") {
    const data = exampleConfig();
    if (options.json) emitEnvelope("config example", options, data);
    else console.log(JSON.stringify(data, null, 2));
    return 0;
  }
  if (subcommand === "explain") {
    const data = explainConfig({ repoRoot: rootDir, configPath });
    if (options.json) emitEnvelope("config explain", options, data, data.ok ? [] : data.issues.map((message) => ({ message })));
    else console.log(JSON.stringify(data, null, 2));
    return data.ok ? 0 : 1;
  }
  if (subcommand === "validate") {
    const loaded = loadConfig({ repoRoot: rootDir, configPath });
    const validation = validateConfig(loaded.config);
    const data = { schemaVersion: 1, exists: loaded.exists, path: loaded.path, ...validation };
    if (options.json) emitEnvelope("config validate", options, data, validation.ok ? [] : validation.issues.map((message) => ({ message })));
    else console.log(validation.ok ? "Config valida." : `Config invalida: ${validation.issues.join("; ")}`);
    return validation.ok ? 0 : 1;
  }
  if (subcommand === "init") {
    const data = writeExampleConfig({ repoRoot: rootDir, configPath, force: rest.includes("--force") });
    if (options.json) emitEnvelope("config init", options, data, data.ok ? [] : [{ code: data.code, message: data.code }]);
    else console.log(data.ok ? `Config criada: ${data.path}` : `Config nao criada: ${data.code}`);
    return data.ok ? 0 : 1;
  }
  throw new Error(`Subcomando de config desconhecido: ${subcommand}`);
}

async function runWebhookCommand(args) {
  const [subcommand = "check", ...rest] = args;
  const options = parseStatefulArgs(rest, [
    "--config-path",
    "--payload-json",
    "--idempotency-key",
    "--confirm-external",
    "--enable-live-http",
  ]);
  const configPath = valueAfter(rest, "--config-path", null);
  const payload = parsePayloadJson(valueAfter(rest, "--payload-json", "{}"));
  const context = {
    repoRoot: rootDir,
    configPath,
    idempotencyKey: valueAfter(rest, "--idempotency-key", null),
    confirmedExternal: rest.includes("--confirm-external"),
    liveHttpEnabled: rest.includes("--enable-live-http"),
  };
  if (subcommand === "check") {
    const data = checkWebhook(context);
    if (options.json) emitEnvelope("webhook check", options, data, data.ok ? [] : [{ code: "webhook_not_configured", message: "webhook_not_configured" }]);
    else console.log(data.ok ? "webhook live-ready" : `webhook ${data.mode}`);
    return data.ok ? 0 : 1;
  }
  if (subcommand === "dry-run") {
    const data = dryRunWebhook(payload, { ...context, confirmed: true });
    if (options.json) emitEnvelope("webhook dry-run", options, data, data.ok ? [] : [{ code: data.code || "webhook_dry_run_blocked", message: data.code || "webhook_dry_run_blocked" }]);
    else console.log(data.ok ? "webhook dry-run ok" : "webhook dry-run blocked");
    return data.ok ? 0 : 1;
  }
  if (subcommand === "send") {
    const data = await sendWebhook(payload, {
      ...context,
      dryRunCompleted: true,
      confirmed: true,
    });
    if (options.json) emitEnvelope("webhook send", options, data, data.ok ? [] : [{ code: data.code || "webhook_send_blocked", message: data.code || "webhook_send_blocked" }]);
    else console.log(data.ok ? "webhook sent" : `webhook blocked: ${data.code}`);
    return data.ok ? 0 : 1;
  }
  throw new Error(`Subcomando de webhook desconhecido: ${subcommand}`);
}

async function runN8nCommand(args) {
  const [subcommand = "check", ...rest] = args;
  const options = parseStatefulArgs(rest, [
    "--config-path",
    "--workflow-id",
    "--payload-json",
    "--idempotency-key",
    "--confirm-external",
    "--enable-live-http",
  ]);
  const configPath = valueAfter(rest, "--config-path", null);
  const workflowId = valueAfter(rest, "--workflow-id", "wf_live_default");
  const payload = parsePayloadJson(valueAfter(rest, "--payload-json", "{}"));
  const context = {
    repoRoot: rootDir,
    configPath,
    idempotencyKey: valueAfter(rest, "--idempotency-key", null),
    confirmedExternal: rest.includes("--confirm-external"),
    liveHttpEnabled: rest.includes("--enable-live-http"),
  };
  if (subcommand === "check") {
    const data = checkN8n(context);
    if (options.json) emitEnvelope("n8n check", options, data, data.ok ? [] : [{ code: "n8n_not_configured", message: "n8n_not_configured" }]);
    else console.log(data.ok ? "n8n live-ready" : `n8n ${data.mode}`);
    return data.ok ? 0 : 1;
  }
  if (subcommand === "dry-run") {
    const data = dryRunN8n(workflowId, payload, { ...context, confirmed: true });
    if (options.json) emitEnvelope("n8n dry-run", options, data, data.ok ? [] : [{ code: data.code || "n8n_dry_run_blocked", message: data.code || "n8n_dry_run_blocked" }]);
    else console.log(data.ok ? "n8n dry-run ok" : "n8n dry-run blocked");
    return data.ok ? 0 : 1;
  }
  if (subcommand === "trigger") {
    const data = await triggerN8n(workflowId, payload, {
      ...context,
      dryRunCompleted: true,
      confirmed: true,
    });
    if (options.json) emitEnvelope("n8n trigger", options, data, data.ok ? [] : [{ code: data.code || "n8n_trigger_blocked", message: data.code || "n8n_trigger_blocked" }]);
    else console.log(data.ok ? "n8n triggered" : `n8n blocked: ${data.code}`);
    return data.ok ? 0 : 1;
  }
  throw new Error(`Subcomando de n8n desconhecido: ${subcommand}`);
}

async function runWhatsAppCommand(args) {
  const [subcommand = "check", ...rest] = args;
  const options = parseStatefulArgs(rest, [
    "--config-path",
    "--recipient",
    "--body",
    "--template-id",
    "--idempotency-key",
    "--consent",
    "--confirm-external",
    "--enable-live-http",
  ]);
  const context = {
    repoRoot: rootDir,
    configPath: valueAfter(rest, "--config-path", null),
    idempotencyKey: valueAfter(rest, "--idempotency-key", null),
    consent: rest.includes("--consent"),
    confirmedExternal: rest.includes("--confirm-external"),
    liveHttpEnabled: rest.includes("--enable-live-http"),
  };
  const input = {
    recipient: valueAfter(rest, "--recipient", "unknown-recipient"),
    body: valueAfter(rest, "--body", "Mensagem de teste"),
    templateId: valueAfter(rest, "--template-id", "local-template"),
  };
  if (subcommand === "check") {
    const data = checkWhatsApp(context);
    if (options.json) emitEnvelope("whatsapp check", options, data, data.ok ? [] : [{ code: "whatsapp_not_configured", message: "whatsapp_not_configured" }]);
    else console.log(data.ok ? "whatsapp live-ready" : `whatsapp ${data.mode}`);
    return data.ok ? 0 : 1;
  }
  if (subcommand === "dry-run") {
    const data = dryRunWhatsApp(input, { ...context, confirmed: true });
    if (options.json) emitEnvelope("whatsapp dry-run", options, data, data.ok ? [] : [{ code: data.code || "whatsapp_dry_run_blocked", message: data.code || "whatsapp_dry_run_blocked" }]);
    else console.log(data.ok ? "whatsapp dry-run ok" : "whatsapp dry-run blocked");
    return data.ok ? 0 : 1;
  }
  if (subcommand === "send") {
    const data = await sendWhatsApp(input, { ...context, dryRunCompleted: true, confirmed: true });
    if (options.json) emitEnvelope("whatsapp send", options, data, data.ok ? [] : [{ code: data.code || "whatsapp_send_blocked", message: data.code || "whatsapp_send_blocked" }]);
    else console.log(data.ok ? "whatsapp sent" : `whatsapp blocked: ${data.code}`);
    return data.ok ? 0 : 1;
  }
  throw new Error(`Subcomando de whatsapp desconhecido: ${subcommand}`);
}

function parseDoctorArgs(args) {
  const normalized = normalizeArgs(args);
  let homePath = "";

  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === "--home-path") {
      const value = normalized[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Parametro --home-path exige um valor.");
      }
      homePath = value;
      i += 1;
      continue;
    }
    throw new Error(`Parametro desconhecido: ${arg}`);
  }

  return homePath;
}

function runDoctor(args) {
  const script = path.join(rootDir, "orquestrador", "doctor.ps1");
  if (!commandExists(script)) {
    throw new Error(`Diagnostico nao encontrado: ${script}`);
  }

  const homePath = parseDoctorArgs(args);
  const psArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script];
  if (homePath) {
    psArgs.push("-HomePath", homePath);
  }

  if (process.platform === "win32") {
    return run("powershell", psArgs);
  }

  for (const command of ["pwsh", "powershell"]) {
    try {
      return run(command, psArgs);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  throw new Error("O comando doctor requer PowerShell. Instale pwsh ou use orquestrador-maestro verify.");
}

function runInitDev(args) {
  const isWindows = process.platform === "win32";
  const script = path.join(rootDir, "orquestrador", "bin", isWindows ? "init-project-dev.ps1" : "init-project-dev.sh");
  if (!commandExists(script)) {
    throw new Error(`Inicializador DEV nao encontrado: ${script}`);
  }

  if (isWindows) {
    const translated = translateArgs(args, initDevFlagDefs, "ps");
    return run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...translated]);
  }

  const translated = translateArgs(args, initDevFlagDefs, "sh");
  return run("bash", [script, ...translated]);
}

function runDevContextHelper(helperCommand, args) {
  const script = path.join(rootDir, "orquestrador", "bin", "dev-context-tools.js");
  if (!commandExists(script)) {
    throw new Error(`Helper DEV nao encontrado: ${script}`);
  }
  return run(process.execPath, [script, helperCommand, ...args]);
}

function getTelemetryConfigPath() {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "OrquestradorMaestro", "telemetry.json");
  }

  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "orquestrador-maestro", "telemetry.json");
}

function defaultTelemetryEndpoint() {
  return process.env.ORQUESTRADOR_MAESTRO_TELEMETRY_ENDPOINT ||
    (packageJson.config && packageJson.config.telemetryEndpoint) ||
    "";
}

function defaultTelemetryConfig() {
  return {
    enabled: false,
    endpoint: defaultTelemetryEndpoint(),
    anonymousId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    consentVersion: 0
  };
}

function normalizeTelemetryConfig(config) {
  const rawConfig = config && typeof config === "object" ? config : {};
  const hasCurrentConsent =
    rawConfig.enabled === true &&
    rawConfig.consentVersion === telemetryConsentVersion;

  return {
    ...defaultTelemetryConfig(),
    ...rawConfig,
    enabled: hasCurrentConsent,
    endpoint: rawConfig.endpoint || defaultTelemetryEndpoint(),
    consentVersion: hasCurrentConsent ? telemetryConsentVersion : (rawConfig.consentVersion || 0)
  };
}

function readTelemetryConfig() {
  const configPath = getTelemetryConfigPath();
  if (!fs.existsSync(configPath)) {
    return defaultTelemetryConfig();
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return normalizeTelemetryConfig(config);
  } catch {
    return defaultTelemetryConfig();
  }
}

function writeTelemetryConfig(config) {
  const configPath = getTelemetryConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function telemetryDisabledByEnv() {
  const value = String(process.env.ORQUESTRADOR_MAESTRO_TELEMETRY || "").toLowerCase();
  return value === "0" || value === "false" || value === "off" || value === "disabled";
}

function validateTelemetryEndpoint(endpoint) {
  if (!endpoint) {
    return "";
  }

  const url = new URL(endpoint);
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) {
    throw new Error("Endpoint de telemetria deve usar HTTPS, exceto localhost para desenvolvimento.");
  }
  return url.toString();
}

function endpointLabel(endpoint) {
  if (!endpoint) {
    return "[not configured]";
  }
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "[invalid]";
  }
}

function sanitizeFlags(args) {
  const normalized = normalizeArgs(args);
  const flags = [];
  for (const arg of normalized) {
    if (arg.startsWith("--")) {
      flags.push(arg);
    }
  }
  return Array.from(new Set(flags)).sort();
}

function readBundledFile(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  if (!commandExists(filePath)) {
    throw new Error(`Arquivo nao encontrado no pacote: ${relativePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function extractMarkdownSections(markdown, limit) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const header = lines[0] && lines[0].startsWith("# ") ? lines[0] : "";
  const body = header ? lines.slice(1) : lines;
  const captured = [];
  let sectionCount = 0;
  let capturing = false;

  for (const line of body) {
    if (line.startsWith("## ")) {
      if (capturing && sectionCount >= limit) {
        break;
      }
      sectionCount += 1;
      capturing = sectionCount <= limit;
    }
    if (capturing) {
      captured.push(line);
    }
  }

  return [header, captured.join("\n").trim()].filter(Boolean).join("\n\n").trim();
}

function buildTelemetryPayload(command, args, exitCode, errorName) {
  const config = readTelemetryConfig();
  return {
    schemaVersion: 1,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    event: "cli_command",
    command,
    flags: sanitizeFlags(args),
    exitCode,
    success: exitCode === 0,
    errorName: errorName || null,
    platform: process.platform,
    arch: process.arch,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    ci: Boolean(process.env.CI),
    anonymousId: config.anonymousId,
    timestamp: new Date().toISOString()
  };
}

function postTelemetry(endpoint, payload) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      resolve({ sent: false, reason: "invalid-endpoint" });
      return;
    }

    const body = JSON.stringify(payload);
    const transport = url.protocol === "http:" ? http : https;
    const request = transport.request({
      method: "POST",
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "user-agent": `${packageJson.name}/${packageJson.version}`
      },
      timeout: telemetryTimeoutMs
    }, (response) => {
      response.resume();
      response.on("end", () => {
        resolve({
          sent: response.statusCode >= 200 && response.statusCode < 300,
          reason: `http-${response.statusCode}`
        });
      });
    });

    request.on("timeout", () => {
      request.destroy();
      resolve({ sent: false, reason: "timeout" });
    });
    request.on("error", (error) => {
      resolve({ sent: false, reason: error.code || "request-error" });
    });
    request.end(body);
  });
}

async function sendTelemetry(payload) {
  if (telemetryDisabledByEnv()) {
    return { sent: false, reason: "disabled-by-env" };
  }

  const config = readTelemetryConfig();
  if (!config.enabled) {
    return { sent: false, reason: "disabled" };
  }

  let endpoint;
  try {
    endpoint = validateTelemetryEndpoint(config.endpoint || defaultTelemetryEndpoint());
  } catch {
    return { sent: false, reason: "invalid-endpoint" };
  }

  if (!endpoint) {
    return { sent: false, reason: "no-endpoint" };
  }

  writeTelemetryConfig({ ...config, endpoint });
  const result = await postTelemetry(endpoint, payload);
  if (!result.sent && process.env.ORQUESTRADOR_MAESTRO_TELEMETRY_DEBUG) {
    console.error(`Telemetry skipped: ${result.reason}`);
  }
  return result;
}

function printTelemetryStatus() {
  const config = readTelemetryConfig();
  const envDisabled = telemetryDisabledByEnv();
  const endpoint = config.endpoint || defaultTelemetryEndpoint();
  let status = "desabilitada";
  if (config.enabled && !envDisabled && endpoint) {
    status = "habilitada e enviando";
  } else if (config.enabled && !envDisabled) {
    status = "habilitada, aguardando endpoint";
  }

  console.log(`Telemetria: ${status}

Endpoint: ${endpointLabel(endpoint)}
Config: ${getTelemetryConfigPath()}
AnonymousId: ${config.anonymousId}

Payload permitido:
  - comando executado
  - flags sem valores
  - versao do pacote
  - plataforma, arquitetura e versao major do Node.js
  - exit code e sucesso/falha
  - identificador anonimo aleatorio

Nunca coletar:
  - telefone
  - nome de usuario
  - caminho local
  - conteudo de projeto
  - tokens, prompts, logs ou nomes de arquivos privados

Para desabilitar:
  orquestrador-maestro telemetry disable
  ORQUESTRADOR_MAESTRO_TELEMETRY=0 orquestrador-maestro install

Para habilitar:
  orquestrador-maestro telemetry endpoint https://seu-dominio.example/api/orquestrador-telemetry
  orquestrador-maestro telemetry enable`);
}

function parseTelemetryEndpoint(args) {
  const normalized = normalizeArgs(args);
  const index = normalized.indexOf("--endpoint");
  if (index === -1) {
    return "";
  }
  const endpoint = normalized[index + 1];
  if (!endpoint || endpoint.startsWith("--")) {
    throw new Error("Parametro --endpoint exige uma URL.");
  }
  return validateTelemetryEndpoint(endpoint);
}

async function handleTelemetryCommand(args) {
  const [subcommand = "status", ...rest] = args;
  const config = readTelemetryConfig();

  if (subcommand === "status") {
    printTelemetryStatus();
    return 0;
  }

  if (subcommand === "enable") {
    const endpoint = parseTelemetryEndpoint(rest) || config.endpoint || defaultTelemetryEndpoint();
    writeTelemetryConfig({
      ...config,
      enabled: true,
      endpoint,
      consentVersion: telemetryConsentVersion,
      consentedAt: new Date().toISOString()
    });
    console.log("Telemetria habilitada.");
    if (!endpoint) {
      console.log("Nenhum endpoint configurado. Use: orquestrador-maestro telemetry endpoint <url>");
    }
    return 0;
  }

  if (subcommand === "disable") {
    writeTelemetryConfig({ ...config, enabled: false });
    console.log("Telemetria desabilitada.");
    return 0;
  }

  if (subcommand === "endpoint") {
    const endpoint = validateTelemetryEndpoint(rest[0] || "");
    if (!endpoint) {
      throw new Error("Informe a URL do endpoint.");
    }
    writeTelemetryConfig({ ...config, endpoint });
    console.log(`Endpoint de telemetria atualizado: ${endpointLabel(endpoint)}`);
    return 0;
  }

  if (subcommand === "test") {
    const payload = buildTelemetryPayload("telemetry:test", rest, 0, null);
    const result = await sendTelemetry({ ...payload, event: "telemetry_test" });
    console.log(result.sent ? "Evento de teste enviado." : `Evento de teste nao enviado: ${result.reason}`);
    return result.sent ? 0 : 1;
  }

  throw new Error(`Subcomando de telemetria desconhecido: ${subcommand}`);
}

function handleChangelogCommand(args) {
  const normalized = normalizeArgs(args);
  for (const arg of normalized) {
    if (arg !== "--full") {
      throw new Error(`Parametro desconhecido: ${arg}`);
    }
  }

  const changelog = readBundledFile("CHANGELOG.md");
  const shouldPrintFull = normalized.includes("--full");
  const excerpt = shouldPrintFull ? changelog.trim() : extractMarkdownSections(changelog, 2);

  console.log(excerpt);
  console.log(`
Fluxo recomendado para quem ja tem o Orquestrador instalado:
  npm update -g @iapro/orquestrador-maestro-cli
  orquestrador-maestro changelog
  orquestrador-maestro update
  orquestrador-maestro verify
  orquestrador-maestro doctor`);

  if (process.platform !== "win32") {
    console.log("Obs.: em Linux/macOS, doctor requer pwsh ou powershell instalado.");
  }

  return 0;
}

async function dispatch(command, args) {
  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return 0;
  }

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return 0;
  }

  if (command === "--version" || command === "-v" || command === "version") {
    console.log(packageJson.version);
    return 0;
  }

  if (command === "install" || command === "update") {
    return runInstall(args);
  }

  if (command === "setup") {
    return runSetupCommand(args);
  }

  if (command === "uninstall") {
    return runInstall(args, ["--uninstall"]);
  }

  if (command === "list-targets") {
    return runInstall(args, ["--list-targets"]);
  }

  if (command === "dry-run") {
    return runInstall(args, ["--dry-run"]);
  }

  if (command === "verify") {
    return runVerify(args);
  }

  if (command === "validate") {
    return runValidateCommand(args);
  }

  if (command === "skills") {
    return runSkillsCommand(args);
  }

  if (command === "health") {
    return runHealthCommand(args);
  }

  if (command === "local") {
    return runLocalCommand(args);
  }

  if (command === "runs") {
    return runRunsCommand(args);
  }

  if (command === "status") {
    return runStatusCommand(args);
  }

  if (command === "insights") {
    return runInsightsCommand(args);
  }

  if (command === "server") {
    return runServerCommand(args);
  }

  if (command === "panel") {
    return runPanelCommand(args);
  }

  if (command === "integrations") {
    return runIntegrationsCommand(args);
  }

  if (command === "llm") {
    return runLlmCommand(args);
  }

  if (command === "connectors") {
    return runConnectorsCommand(args);
  }

  if (command === "workflows") {
    return runWorkflowsCommand(args);
  }

  if (command === "messages") {
    return runMessagesCommand(args);
  }

  if (command === "queue") {
    return runQueueCommand(args);
  }

  if (command === "metrics") {
    return runMetricsCommand(args);
  }

  if (command === "adapters") {
    return runAdaptersCommand(args);
  }

  if (command === "config") {
    return runConfigCommand(args);
  }

  if (command === "webhook") {
    return runWebhookCommand(args);
  }

  if (command === "n8n") {
    return runN8nCommand(args);
  }

  if (command === "whatsapp") {
    return runWhatsAppCommand(args);
  }

  if (command === "doctor") {
    return runDoctor(args);
  }

  if (command === "init-dev") {
    return runInitDev(args);
  }

  if (command === "compact-worklog") {
    return runDevContextHelper("compact-worklog", args);
  }

  if (command === "check-dev-gates") {
    return runDevContextHelper("check-dev-gates", args);
  }

  if (command === "changelog") {
    return handleChangelogCommand(args);
  }

  if (command === "telemetry") {
    return handleTelemetryCommand(args);
  }

  throw new Error(`Comando desconhecido: ${command}`);
}

async function main() {
  const [command = "--help", ...args] = process.argv.slice(2);
  let exitCode = 0;
  let errorName = null;

  try {
    exitCode = await dispatch(command, args);
  } catch (error) {
    errorName = error.name || "Error";
    console.error(`Erro: ${error.message}`);
    exitCode = 1;
  }

  if (["install", "update", "setup", "uninstall", "list-targets", "dry-run", "verify", "validate", "skills", "health", "local", "runs", "status", "doctor", "insights", "integrations", "llm", "connectors", "workflows", "messages", "queue", "metrics", "adapters", "config", "webhook", "n8n", "whatsapp", "init-dev", "compact-worklog", "check-dev-gates", "changelog"].includes(command)) {
    await sendTelemetry(buildTelemetryPayload(command, args, exitCode, errorName));
  }

  process.exit(exitCode);
}

main();
