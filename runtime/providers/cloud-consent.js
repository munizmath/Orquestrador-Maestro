"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { isAuthorizedRemoteTarget, loadRemoteAuthorization } = require("./remote-authorization");

function openCodeConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config", "opencode", "opencode.json"), "utf8"));
  } catch {
    return {};
  }
}

function isCloudTarget(providerId, model, config = openCodeConfig()) {
  if (["claude", "deepseek", "nexus", "openrouter"].includes(providerId)) return true;
  if (providerId !== "opencode") return false;
  const selected = !model || model === "default" ? config.model : model;
  if (typeof selected !== "string" || !selected.startsWith("ollama/")) return true;
  try {
    const endpoint = new URL(config.provider?.ollama?.options?.baseURL);
    return endpoint.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname);
  } catch {
    return true;
  }
}

function assertCloudConsent(targets, approved, options = {}) {
  const cloudTargets = targets.filter(({ providerId, model }) => isCloudTarget(providerId, model, options.openCodeConfig));
  if (cloudTargets.length === 0 || approved === true) return { authorized: true, source: approved === true ? "task" : "local" };
  const authorization = options.authorization || loadRemoteAuthorization(options).value;
  const unauthorized = cloudTargets.filter((target) => !isAuthorizedRemoteTarget(target, {
    authorization,
    workspacePath: options.workspacePath,
    dataClass: options.dataClass || "source-code"
  }));
  if (unauthorized.length > 0) {
    const providers = unauthorized.map(({ providerId }) => providerId).join(", ");
    const error = new Error(`CLOUD_CONTEXT_APPROVAL_REQUIRED: ${providers} pode enviar contexto do projeto; confirme esta tarefa com --allow-cloud-context ou configure um mandato persistente limitado ao workspace.`);
    error.code = "CLOUD_CONTEXT_APPROVAL_REQUIRED";
    throw error;
  }
  return { authorized: true, source: "standing-mandate", providers: cloudTargets.map(({ providerId }) => providerId) };
}

module.exports = { isCloudTarget, assertCloudConsent, openCodeConfig };
