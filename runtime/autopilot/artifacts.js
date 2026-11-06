"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const ARTIFACT_FILES = Object.freeze({
  checkpoint: "checkpoint.md",
  boundaries: "boundaries.md",
  tasks: "tasks.md",
  validation: "validation.md",
  survival: "survival-guide.md"
});
const WRITE_ORDER = Object.freeze(["boundaries", "tasks", "validation", "survival", "checkpoint"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function missionArtifactRoot(projectRoot) {
  return path.join(path.resolve(projectRoot), ".omx", "autopilot");
}

function renderDocument(name, value) {
  const title = name === "survival" ? "survival-guide" : name;
  const fence = "```";
  return `# Autopilot ${title}\n\n<!-- Machine-readable mission state. Keep this document human-readable; do not edit the JSON without reconciling the mission. -->\n\n${fence}json\n${JSON.stringify(value, null, 2)}\n${fence}\n`;
}

function parseDocument(name, text, filePath) {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/u);
  if (!match) throw new Error(`Autopilot artifact has no JSON state block: ${filePath}`);
  try {
    const value = JSON.parse(match[1]);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("state must be an object");
    return value;
  } catch (error) {
    throw new Error(`Autopilot artifact is invalid (${name}): ${filePath}: ${error.message}`);
  }
}

async function atomicWrite(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporaryPath, "w", 0o600);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporaryPath, filePath);
    try { await fs.chmod(filePath, 0o600); } catch { /* Windows does not expose POSIX modes. */ }
  } catch (error) {
    try { await handle?.close(); } catch { /* preserve original error */ }
    try { await fs.unlink(temporaryPath); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") { /* best effort */ } }
    throw error;
  }
}

class MissionArtifacts {
  constructor(projectRoot) {
    this.projectRoot = path.resolve(projectRoot || process.cwd());
    this.root = missionArtifactRoot(this.projectRoot);
  }

  pathFor(name) {
    if (!Object.prototype.hasOwnProperty.call(ARTIFACT_FILES, name)) throw new TypeError(`unknown Autopilot artifact: ${name}`);
    return path.join(this.root, ARTIFACT_FILES[name]);
  }

  async exists() {
    try {
      await fs.access(this.pathFor("checkpoint"));
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  }

  async readAll() {
    const values = {};
    let found = false;
    for (const name of Object.keys(ARTIFACT_FILES)) {
      try {
        values[name] = parseDocument(name, await fs.readFile(this.pathFor(name), "utf8"), this.pathFor(name));
        found = true;
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
    }
    if (!found) return null;
    const missing = Object.keys(ARTIFACT_FILES).filter((name) => !values[name]);
    if (missing.length > 0) throw new Error(`Autopilot mission is incomplete; missing artifacts: ${missing.join(", ")}`);
    return clone(values);
  }

  async writeAll(values) {
    for (const name of Object.keys(ARTIFACT_FILES)) {
      if (!values[name] || typeof values[name] !== "object") throw new TypeError(`artifact ${name} must be an object`);
    }
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    for (const name of WRITE_ORDER) {
      await atomicWrite(this.pathFor(name), renderDocument(name, values[name]));
    }
    return Object.freeze({ root: this.root, files: Object.freeze(Object.fromEntries(Object.keys(ARTIFACT_FILES).map((name) => [name, this.pathFor(name)]))) });
  }
}

module.exports = { ARTIFACT_FILES, MissionArtifacts, missionArtifactRoot, parseDocument, renderDocument };
