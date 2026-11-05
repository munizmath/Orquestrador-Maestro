"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pruneProviderHealth } = require("../providers/provider-health");

const OWNED_TEMP_DIRECTORIES = Object.freeze([".orquestrador-maestro/tmp", ".orquestrador-maestro/worktrees"]);

function collectOwnedEntries(workspacePath, maxAgeMs) {
  const root = path.resolve(workspacePath);
  const cutoff = Date.now() - maxAgeMs;
  const entries = [];
  for (const relativeRoot of OWNED_TEMP_DIRECTORIES) {
    const directory = path.join(root, relativeRoot);
    if (!fs.existsSync(directory)) continue;
    const stack = [directory];
    while (stack.length > 0) {
      const current = stack.pop();
      let children;
      try { children = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
      for (const child of children) {
        const absolute = path.join(current, child.name);
        if (child.isSymbolicLink()) continue;
        if (child.isDirectory()) { stack.push(absolute); continue; }
        try {
          const stat = fs.statSync(absolute);
          if (stat.mtimeMs < cutoff) entries.push({ path: path.relative(root, absolute).replaceAll("\\", "/"), bytes: stat.size, modifiedAt: new Date(stat.mtimeMs).toISOString() });
        } catch {}
      }
    }
  }
  return entries;
}

function cleanupWorkspace({ workspacePath = process.cwd(), maxAgeMs = 7 * 24 * 60 * 60 * 1000, apply = false } = {}) {
  if (!Number.isInteger(maxAgeMs) || maxAgeMs < 60 * 1000) throw new TypeError("maxAgeMs must be at least one minute");
  const root = path.resolve(workspacePath);
  const candidates = collectOwnedEntries(root, maxAgeMs);
  const removed = [];
  if (apply) {
    for (const candidate of candidates) {
      const absolute = path.join(root, candidate.path);
      try { fs.unlinkSync(absolute); removed.push(candidate.path); } catch {}
    }
  }
  const health = pruneProviderHealth();
  return { workspacePath: root, apply, candidates, removed, providerHealth: health, policy: "owned-temporaries-only" };
}

module.exports = { OWNED_TEMP_DIRECTORIES, collectOwnedEntries, cleanupWorkspace };
