"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { redactText } = require("../core/security.js");

function defaultStateDir(repoRoot = process.cwd()) {
  return path.join(repoRoot, ".omx", "state");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizePathForOutput(value) {
  return redactText(String(value));
}

function assertInside(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`Path fora do storage local: ${sanitizePathForOutput(targetPath)}`);
  }
}

function readJson(filePath, fallback = undefined) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`JSON invalido em ${sanitizePathForOutput(filePath)}: ${error.message}`);
  }
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function listJson(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => path.join(dirPath, file));
}

function createLocalStore(options = {}) {
  const rootDir = options.rootDir || defaultStateDir(options.repoRoot);
  return {
    rootDir,
    ensure() {
      ensureDir(rootDir);
    },
    path(...segments) {
      const target = path.join(rootDir, ...segments);
      assertInside(rootDir, target);
      return target;
    },
    readJson(relativePath, fallback) {
      return readJson(this.path(relativePath), fallback);
    },
    writeJson(relativePath, value) {
      writeJsonAtomic(this.path(relativePath), value);
    },
    listJson(relativeDir = "") {
      return listJson(this.path(relativeDir));
    },
  };
}

function createTempStore(prefix = "omx-store-") {
  return createLocalStore({ rootDir: fs.mkdtempSync(path.join(os.tmpdir(), prefix)) });
}

module.exports = {
  defaultStateDir,
  ensureDir,
  sanitizePathForOutput,
  readJson,
  writeJsonAtomic,
  listJson,
  createLocalStore,
  createTempStore,
};
