"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../../package.json");
const { resolveGitContext } = require("../../orquestrador/lib/git-context");
const { getProfile } = require("../profiles");
const {
  loadRemoteAuthorization,
  isRemoteAuthorizationActive,
  isWorkspaceAuthorized,
  isAuthorizedRemoteTarget,
  findForbiddenWorkspaceEntries
} = require("../providers/remote-authorization");
const { selectHealthyProviders } = require("../providers/provider-health");

const DEFAULT_PROVIDERS = Object.freeze(["codex", "opencode", "openrouter", "deepseek", "claude", "nexus"]);

function fileExists(filePath) {
  try { return fs.existsSync(filePath); } catch { return false; }
}

function safeGitContext(workspacePath) {
  try {
    const context = resolveGitContext(workspacePath);
    return {
      repositoryId: context.repositoryId || null,
      remote: context.remote || null,
      branch: context.branch || null,
      headCommit: context.headCommit || null,
      detached: context.detached === true,
      vcs: context.vcs || null
    };
  } catch (error) {
    return { repositoryId: null, remote: null, branch: null, headCommit: null, detached: false, vcs: null, error: error.message };
  }
}

function resolveProviders(value) {
  if (Array.isArray(value) && value.length > 0) return [...new Set(value.map(String).map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (typeof value === "string" && value.trim()) return [...new Set(value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))];
  return [...DEFAULT_PROVIDERS];
}

function buildPreflight({ workspacePath = process.cwd(), providers, dataClass = "source-code", maxAgents, channel = "auto" } = {}) {
  const resolvedWorkspace = path.resolve(workspacePath);
  const authorization = loadRemoteAuthorization();
  const selectedProviders = resolveProviders(providers);
  const profile = getProfile("developer");
  const forbiddenEntries = findForbiddenWorkspaceEntries(resolvedWorkspace);
  const workspaceAuthorized = isWorkspaceAuthorized(resolvedWorkspace, authorization.value);
  const authActive = isRemoteAuthorizationActive(authorization.value);
  const observedHealthyProviders = selectHealthyProviders({ providerIds: selectedProviders, maxAgents: maxAgents || 20 });
  const providerChecks = selectedProviders.map((providerId) => ({
    providerId,
    local: providerId === "codex",
    cloud: providerId !== "codex",
    authorized: providerId === "codex" || isAuthorizedRemoteTarget({ providerId }, {
      authorization: authorization.value,
      workspacePath: resolvedWorkspace,
      dataClass
    }),
    reason: providerId === "codex"
      ? "local-provider"
      : !authActive
        ? "standing-mandate-inactive"
        : !workspaceAuthorized
          ? forbiddenEntries.length > 0 ? "sensitive-workspace-entry" : "workspace-outside-authorized-roots"
          : !Array.isArray(authorization.value?.providers) || !authorization.value.providers.map(String).map((item) => item.toLowerCase()).includes(providerId)
            ? "provider-not-in-mandate"
            : !(authorization.value?.dataClassesAllowed || []).includes(dataClass)
              ? "data-class-not-in-mandate"
              : "authorized"
  }));
  const devFiles = ["DEV/HANDOFF.md", "DEV/CONTEXT.md", "DEV/VERIFY.md", "DEV/WORKLOG.md"];
  const projectMemory = Object.fromEntries(devFiles.map((relative) => [relative, fileExists(path.join(resolvedWorkspace, relative))]));
  const failures = [];
  if (!fileExists(resolvedWorkspace)) failures.push("workspace-not-found");
  if (forbiddenEntries.length > 0) failures.push("sensitive-workspace-entry");
  if (providerChecks.some((item) => item.cloud && !item.authorized)) failures.push("remote-provider-not-authorized");

  return Object.freeze({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    package: { name: packageJson.name, version: packageJson.version },
    channel: { requested: channel, entrypoint: process.argv[1] || null, node: process.version, host: os.hostname() },
    workspace: {
      path: resolvedWorkspace,
      authorized: workspaceAuthorized,
      roots: authorization.value?.workspaceRoots || [],
      forbiddenEntries: forbiddenEntries.slice(0, 50),
      forbiddenEntryCount: forbiddenEntries.length
    },
    git: safeGitContext(resolvedWorkspace),
    authorization: {
      filePath: authorization.filePath,
      active: authActive,
      validUntil: authorization.value?.validUntil || null,
      providers: authorization.value?.providers || [],
      dataClassesAllowed: authorization.value?.dataClassesAllowed || [],
      costPolicy: authorization.value?.costPolicy || null
    },
    providers: providerChecks,
    orchestration: {
      profile: profile?.id || "developer",
      maxAgents: Number.isInteger(maxAgents) ? maxAgents : 20,
      mode: "elastic-bounded",
      costIncrementalBRL: 0,
      observedHealthyProviders: observedHealthyProviders.map((entry) => entry.providerId),
      observedHealthyCount: observedHealthyProviders.length
    },
    projectMemory,
    status: failures.length === 0 ? "READY" : "BLOCKED",
    failures
  });
}

function formatPreflight(result) {
  const lines = [
    `Preflight Maestro: ${result.status}`,
    `Workspace: ${result.workspace.path}`,
    `Canal: ${result.channel.requested} | versão ${result.package.version}`,
    `Autorização remota: ${result.authorization.active ? "ativa" : "inativa"}${result.authorization.validUntil ? ` até ${result.authorization.validUntil}` : ""}`,
    `Roster: até ${result.orchestration.maxAgents} agentes (${result.orchestration.mode}) | saudáveis observados ${result.orchestration.observedHealthyCount} | custo incremental R$ ${result.orchestration.costIncrementalBRL.toFixed(2)}`,
    `Provedores: ${result.providers.map((item) => `${item.providerId}=${item.authorized ? "ok" : item.reason}`).join(", ")}`
  ];
  if (result.workspace.forbiddenEntryCount > 0) lines.push(`Entradas sensíveis: ${result.workspace.forbiddenEntryCount} (contexto remoto bloqueado)`);
  if (result.failures.length > 0) lines.push(`Impedimentos: ${result.failures.join(", ")}`);
  return lines.join("\n");
}

module.exports = { DEFAULT_PROVIDERS, buildPreflight, formatPreflight, resolveProviders };
