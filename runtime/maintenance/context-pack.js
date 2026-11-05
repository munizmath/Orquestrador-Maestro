"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { isSensitiveName } = require("../providers/remote-authorization");

const SKIPPED_DIRECTORIES = new Set([
  ".git", ".orquestrador", ".orquestrador-maestro", "node_modules", "dist", "build", ".next", "coverage", "tmp", "cache", "caches",
  ".agents", ".claude", ".codex", ".opencode", ".cursor", ".gemini", ".windsurf", ".antigravity-skills", ".mimo", ".kimi-code", "skill-library", ".local"
]);
const DEFAULT_MAX_FILES = 160;
const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_FILE_BYTES = 48 * 1024;

function walkFiles(workspacePath, relative = "", result = [], omitted = [], depth = 0) {
  if (depth > 12) return { result, omitted };
  const directory = path.join(workspacePath, relative);
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return { result, omitted }; }
  for (const entry of entries) {
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    const normalized = childRelative.replaceAll("\\", "/");
    if (entry.isSymbolicLink()) { omitted.push({ path: normalized, reason: "symlink" }); continue; }
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      if (isSensitiveName(entry.name)) { omitted.push({ path: normalized, reason: "sensitive-directory" }); continue; }
      walkFiles(workspacePath, childRelative, result, omitted, depth + 1);
      continue;
    }
    if (entry.isFile()) result.push(normalized);
  }
  return { result, omitted };
}

function buildContextPack({ workspacePath = process.cwd(), includeContent = false, maxFiles = DEFAULT_MAX_FILES, maxBytes = DEFAULT_MAX_BYTES, maxFileBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
  const root = path.resolve(workspacePath);
  if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 1000) throw new TypeError("maxFiles must be between 1 and 1000");
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 4 * 1024 * 1024) throw new TypeError("maxBytes must be between 1024 and 4194304");
  const walked = walkFiles(root);
  const files = [];
  const omitted = [...walked.omitted];
  let totalBytes = 0;
  for (const relative of walked.result.sort()) {
    if (files.length >= maxFiles) { omitted.push({ path: relative, reason: "file-count-limit" }); continue; }
    if (isSensitiveName(path.basename(relative)) || relative.split("/").some(isSensitiveName)) { omitted.push({ path: relative, reason: "sensitive" }); continue; }
    const absolute = path.join(root, relative);
    let stat;
    try { stat = fs.statSync(absolute); } catch { omitted.push({ path: relative, reason: "unreadable" }); continue; }
    if (stat.size > maxFileBytes) { omitted.push({ path: relative, bytes: stat.size, reason: "file-size-limit" }); continue; }
    let content;
    try {
      const bytes = fs.readFileSync(absolute);
      if (bytes.includes(0)) { omitted.push({ path: relative, bytes: stat.size, reason: "binary" }); continue; }
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch { omitted.push({ path: relative, reason: "not-utf8" }); continue; }
    if (totalBytes + stat.size > maxBytes) { omitted.push({ path: relative, bytes: stat.size, reason: "aggregate-size-limit" }); continue; }
    const item = { path: relative, bytes: stat.size, sha256: crypto.createHash("sha256").update(content, "utf8").digest("hex") };
    if (includeContent) item.content = content;
    files.push(item);
    totalBytes += stat.size;
  }
  return Object.freeze({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    workspacePath: root,
    policy: { includeContent, maxFiles, maxBytes, maxFileBytes, sensitiveHandling: "omit" },
    files,
    omitted: omitted.slice(0, 100),
    totals: { files: files.length, bytes: totalBytes, omitted: omitted.length, omittedPreview: Math.min(omitted.length, 100) }
  });
}

module.exports = { DEFAULT_MAX_FILES, DEFAULT_MAX_BYTES, DEFAULT_MAX_FILE_BYTES, buildContextPack };
