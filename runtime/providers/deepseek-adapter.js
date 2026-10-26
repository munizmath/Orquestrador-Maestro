"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { capabilities } = require("../core");
const { ProviderAdapter } = require("./provider-adapter");
const { detectExecutable, startProcess } = require("./process-execution");

function configPath() {
  return process.env.MAESTRO_PROVIDER_CONFIG || path.join(os.homedir(), ".config", "orquestrador-maestro", "providers.json");
}

function loadGatewayConfig() {
  if (!fs.existsSync(configPath())) return null;
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath(), "utf8")).deepseekGateway;
  } catch {
    return null;
  }
  if (!config || !["root", "stateDir", "envFile"].every((key) => typeof config[key] === "string" && path.isAbsolute(config[key]))) return null;
  const port = config.port === undefined ? 8765 : config.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { root: config.root, stateDir: config.stateDir, envFile: config.envFile, port };
}

function gatewayScript(config) {
  return path.join(config.root, "tools", "deepseek_gateway", "server.py");
}

function gatewayModuleArgs(config, action, extra = []) {
  return ["-m", "tools.deepseek_gateway.server", action, "--state-dir", config.stateDir, "--env-file", config.envFile, "--port", String(config.port), ...extra];
}

function command(config, action, extra = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", gatewayModuleArgs(config, action, extra), {
      cwd: config.root, shell: false, stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk.toString("utf8")).slice(-8192); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString("utf8")).slice(-8192); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `Gateway saiu com código ${code}`)));
  });
}

function health(port) {
  return new Promise((resolve) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: "/health", timeout: 500 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.once("error", () => resolve(false));
    request.once("timeout", () => { request.destroy(); resolve(false); });
  });
}

function readAgentToken(config, agentId) {
  const file = path.join(config.stateDir, "agent-tokens", `${agentId}.token`);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.mode & 0o077 || (process.getuid && stat.uid !== process.getuid())) throw new Error("Token do gateway com permissões inválidas");
  return fs.readFileSync(file, "utf8").trim();
}

class DeepSeekGatewayAdapter extends ProviderAdapter {
  constructor({ config = loadGatewayConfig(), executable = "codex" } = {}) {
    super("deepseek");
    this.config = config;
    this.executable = executable;
    this.cloudContextApproved = false;
  }

  approveCloudContextForTask() { this.cloudContextApproved = true; }

  async detect() {
    const config = this.config;
    if (!config || !fs.existsSync(gatewayScript(config)) || !fs.existsSync(path.join(config.root, "tools", "deepseek_gateway", "models.json"))) {
      return { id: this.id, installed: false, error: "Gateway DeepSeek não configurado" };
    }
    const cli = await detectExecutable({ executable: this.executable, providerId: this.id });
    return { ...cli, ready: cli.installed && await health(config.port) };
  }

  async capabilities() {
    return capabilities({ headless: true, structuredEvents: true, streaming: true, modelSelection: true, sandboxControl: true });
  }

  async start() {
    if (!this.config) throw new Error("Gateway DeepSeek não configurado");
    if (await health(this.config.port)) return "Gateway DeepSeek já está ativo.";
    const child = spawn("python3", gatewayModuleArgs(this.config, "serve"), {
      cwd: this.config.root, shell: false, detached: true, stdio: "ignore"
    });
    child.once("error", () => {});
    child.unref();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (await health(this.config.port)) return "Gateway DeepSeek ativo.";
    }
    throw new Error("Gateway DeepSeek não iniciou; confira o saldo e a configuração privada.");
  }

  async report() {
    if (!this.config) throw new Error("Gateway DeepSeek não configurado");
    return command(this.config, "report");
  }

  async execute(request) {
    if (!this.config) throw new Error("Gateway DeepSeek não configurado");
    if (request.cloudContextApproved !== true && this.cloudContextApproved !== true) throw new Error("CLOUD_CONTEXT_APPROVAL_REQUIRED: confirme o envio de contexto nesta tarefa");
    if (request.model && !["default", "deepseek-flash"].includes(request.model)) throw new Error("O gateway permite apenas deepseek-flash");
    if (!await health(this.config.port)) throw new Error("Gateway DeepSeek parado. Execute 'orquestrador-maestro providers start deepseek'.");
    const agentId = `maestro-${crypto.randomUUID().replace(/-/gu, "").slice(0, 16)}`;
    await command(this.config, "add-agent", ["--agent-id", agentId, "--task-id", agentId]);
    try {
      const token = readAgentToken(this.config, agentId);
      const agentHome = path.join(this.config.stateDir, "codex-homes", agentId);
      fs.mkdirSync(agentHome, { recursive: true, mode: 0o700 });
      fs.chmodSync(agentHome, 0o700);
      const catalog = path.join(this.config.root, "tools", "deepseek_gateway", "models.json");
      const args = [
        "exec", "--json", "--color", "never", "--ignore-user-config", "--ephemeral", "--model", "deepseek-flash",
        "--cd", path.resolve(request.workspacePath || process.cwd()), "--skip-git-repo-check",
        "--sandbox", request.sandbox === "read-only" ? "read-only" : "workspace-write",
        "-c", 'model_provider="deepseek_gateway"',
        "-c", `model_catalog_json=${JSON.stringify(catalog)}`,
        "-c", 'model_providers.deepseek_gateway.name="DeepSeek via gateway"',
        "-c", `model_providers.deepseek_gateway.base_url="http://127.0.0.1:${this.config.port}/v1"`,
        "-c", 'model_providers.deepseek_gateway.env_key="DEEPSEEK_GATEWAY_TOKEN"',
        "-c", 'model_providers.deepseek_gateway.wire_api="responses"',
        "-c", "model_providers.deepseek_gateway.requires_openai_auth=false",
        "-c", 'web_search="disabled"', "-c", 'model_reasoning_effort="low"',
        "-c", "project_doc_max_bytes=4096", "-c", "skills.include_instructions=false",
        "-c", 'shell_environment_policy.exclude=["DEEPSEEK_GATEWAY_TOKEN"]'
      ];
      const handle = startProcess({
        executable: this.executable,
        args,
        request: { ...request, environment: { ...(request.environment || {}), DEEPSEEK_GATEWAY_TOKEN: token, CODEX_HOME: agentHome } },
        providerId: this.id
      });
      return Object.freeze({
        ...handle,
        result: handle.result.finally(() => command(this.config, "revoke-agent", ["--agent-id", agentId]))
      });
    } catch (error) {
      await command(this.config, "revoke-agent", ["--agent-id", agentId]);
      throw error;
    }
  }
}

module.exports = { DeepSeekGatewayAdapter, loadGatewayConfig, health };
