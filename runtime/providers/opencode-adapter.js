"use strict";

const os = require("node:os");
const path = require("node:path");
const { capabilities } = require("../core");
const { ProviderAdapter } = require("./provider-adapter");
const { isCloudTarget, openCodeConfig } = require("./cloud-consent");
const { detectExecutable, startProcess } = require("./process-execution");
const { assertSandboxHonourable } = require("./sandbox-contract");

class OpenCodeAdapter extends ProviderAdapter {
  constructor({ executable = "opencode", commandPrefixArgs = [] } = {}) {
    super("opencode");
    this.executable = executable;
    this.commandPrefixArgs = Object.freeze([...commandPrefixArgs]);
  }

  async detect() { return detectExecutable({ executable: this.executable, args: this.commandPrefixArgs, providerId: this.id }); }
  // opencode exposes no sandbox flag in this adapter, so sandboxControl is
  // reported honestly as false and any explicit sandbox request is refused
  // (fail-closed) instead of being silently ignored.
  async capabilities() { return capabilities({ headless: true, structuredEvents: true, streaming: true, sessionResume: true, modelSelection: true, mcp: true }); }
  async execute(request) {
    const selectedModel = !request.model || request.model === "default" ? openCodeConfig().model : request.model;
    if (typeof selectedModel === "string" && /(^|\/)deepseek(?:\/|-)/iu.test(selectedModel)) {
      throw new Error("Use --provider deepseek para preservar o orçamento compartilhado do gateway.");
    }
    const args = [...this.commandPrefixArgs, "run", "--format", "json"];
    if (request.model && request.model !== "default") args.push("--model", request.model);
    if (request.agent) args.push("--agent", request.agent);
    if (request.sessionId) args.push("--session", request.sessionId);
    else if (request.continue === true) args.push("--continue");
    if (request.workspacePath) args.push("--dir", request.workspacePath);
    assertSandboxHonourable({
      requested: request.sandbox,
      providerId: this.id,
      supported: false
    });
    const environment = {
      XDG_DATA_HOME: path.join(os.homedir(), ".local", "share", "orquestrador-maestro"),
      ...(request.environment || {})
    };
    if (!isCloudTarget(this.id, request.model)) {
      const inline = JSON.parse(environment.OPENCODE_CONFIG_CONTENT || process.env.OPENCODE_CONFIG_CONTENT || "{}");
      environment.OPENCODE_CONFIG_CONTENT = JSON.stringify({
        ...inline,
        provider: {
          ...(inline.provider || {}),
          ollama: {
            ...(inline.provider?.ollama || {}),
            options: { ...(inline.provider?.ollama?.options || {}), baseURL: "http://127.0.0.1:11434/v1" }
          }
        }
      });
    }
    return startProcess({
      executable: this.executable,
      args,
      request: {
        ...request,
        environment
      },
      providerId: this.id
    });
  }
}

module.exports = { OpenCodeAdapter };
