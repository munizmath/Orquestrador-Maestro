"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function openCodeConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config", "opencode", "opencode.json"), "utf8"));
  } catch {
    return {};
  }
}

function isCloudTarget(providerId, model, config = openCodeConfig()) {
  if (providerId === "claude" || providerId === "deepseek") return true;
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

function assertCloudConsent(targets, approved) {
  const cloud = targets.find(({ providerId, model }) => isCloudTarget(providerId, model));
  if (cloud && approved !== true) {
    const error = new Error(`CLOUD_CONTEXT_APPROVAL_REQUIRED: ${cloud.providerId} pode enviar contexto do projeto; confirme esta tarefa com --allow-cloud-context.`);
    error.code = "CLOUD_CONTEXT_APPROVAL_REQUIRED";
    throw error;
  }
}

module.exports = { isCloudTarget, assertCloudConsent, openCodeConfig };
