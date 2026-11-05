"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_AUTHORIZATION_FILE = path.join(os.homedir(), ".orquestrador", "REMOTE_PROVIDER_AUTHORIZATION.json");
const SKIPPED_DIRECTORIES = new Set([
  ".git", "node_modules", "dist", "build", ".next", "coverage",
  ".agents", ".claude", ".codex", ".opencode", ".cursor", ".gemini",
  ".windsurf", ".antigravity-skills", ".mimo", ".kimi-code", "skill-library", ".local"
]);

function authorizationFilePath({ filePath } = {}) {
  return filePath || process.env.MAESTRO_REMOTE_AUTHORIZATION_FILE || DEFAULT_AUTHORIZATION_FILE;
}

function loadRemoteAuthorization(options = {}) {
  const filePath = authorizationFilePath(options);
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { filePath, value, active: isRemoteAuthorizationActive(value) };
  } catch {
    return { filePath, value: null, active: false };
  }
}

function isRemoteAuthorizationActive(value, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.version !== 1 || value.status !== "active" || value.authority !== "maestro") return false;
  if (!Array.isArray(value.providers) || value.providers.length === 0) return false;
  if (value.validUntil === null || value.validUntil === undefined || value.validUntil === "") return false;
  const expiresAt = Date.parse(String(value.validUntil));
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function isSensitiveName(name) {
  const value = String(name || "");
  if (/^\.env(?:\.|$)/u.test(value)) return !/^\.env\.(?:example|sample|template)$/u.test(value);
  if (/^(?:id_rsa|credentials?|secrets?|service-account(?:[-_].*)?\.json)$/iu.test(value)) return true;
  return /(?:\.(?:pem|key|p12|pfx)|credentials\.json)$/iu.test(value);
}

function findForbiddenWorkspaceEntries(workspacePath) {
  const pending = [{ directory: workspacePath, depth: 0 }];
  const found = [];
  while (pending.length > 0) {
    const { directory, depth } = pending.pop();
    if (depth > 8) continue;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return [{ path: ".", reason: "unreadable-workspace" }]; }
    for (const entry of entries) {
      const name = entry.name;
      const relative = path.relative(workspacePath, path.join(directory, name)).replaceAll("\\", "/") || name;
      if (isSensitiveName(name)) found.push({ path: relative, reason: "sensitive-name" });
      if (entry.isDirectory() && !entry.isSymbolicLink() && !SKIPPED_DIRECTORIES.has(name)) pending.push({ directory: path.join(directory, name), depth: depth + 1 });
    }
  }
  return found;
}

function hasForbiddenWorkspaceEntries(workspacePath) {
  return findForbiddenWorkspaceEntries(workspacePath).length > 0;
}

function isWorkspaceAuthorized(workspacePath, authorization) {
  if (typeof workspacePath !== "string" || workspacePath.trim() === "") return false;
  if (!Array.isArray(authorization?.workspaceRoots) || authorization.workspaceRoots.length === 0) return false;
  const resolvedWorkspace = path.resolve(workspacePath);
  if (!authorization.workspaceRoots.some((root) => isPathInside(root, resolvedWorkspace))) return false;
  return !hasForbiddenWorkspaceEntries(resolvedWorkspace);
}

function isRemoteProviderAuthorized({ providerId, authorization } = {}) {
  if (!isRemoteAuthorizationActive(authorization)) return false;
  const normalizedProvider = String(providerId || "").trim().toLowerCase();
  return authorization.providers
    .map((provider) => String(provider).trim().toLowerCase())
    .includes(normalizedProvider);
}

function isAuthorizedRemoteTarget(target, options = {}) {
  const authorization = options.authorization || loadRemoteAuthorization(options).value;
  return isRemoteProviderAuthorized({ providerId: target?.providerId, authorization })
    && isWorkspaceAuthorized(options.workspacePath, authorization)
    && Array.isArray(authorization.dataClassesAllowed)
    && authorization.dataClassesAllowed.includes(options.dataClass || "source-code");
}

module.exports = {
  DEFAULT_AUTHORIZATION_FILE,
  authorizationFilePath,
  loadRemoteAuthorization,
  isRemoteAuthorizationActive,
  isRemoteProviderAuthorized,
  isWorkspaceAuthorized,
  hasForbiddenWorkspaceEntries,
  findForbiddenWorkspaceEntries,
  isSensitiveName,
  isAuthorizedRemoteTarget
};
