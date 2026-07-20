#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const json = process.argv.includes("--json");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}

function gitStatus() {
  if (!fs.existsSync(path.join(repoRoot, ".git")) && process.env.ORQUESTRADOR_CONTAINER === "1") {
    return { ok: true, skipped: true, reason: "git metadata is intentionally excluded from the container image" };
  }
  const result = run("git", ["status", "--short"]);
  const lines = result.stdout.split(/\r?\n/).filter(Boolean);
  const suspicious = lines.filter((line) =>
    /(^\?\?|\s)(\.local|\.omx|DEV|.*:Zone\.Identifier|.*\.crdownload|.*\.log|.*\.bak)/i.test(line)
  );
  return { ok: result.ok && suspicious.length === 0, lines, suspicious };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function catalogConsistency() {
  const manifest = readJson("orquestrador/SKILLS_MANIFEST.json");
  const router = readJson("orquestrador/SKILLS_ROUTER.json");
  const catalog = fs.readFileSync(path.join(repoRoot, "docs", "skill-catalog.md"), "utf8");
  const issues = [];
  for (const name of Object.keys(manifest.skills || {})) {
    if (!router.skills || !router.skills[name]) issues.push(`${name}: missing router entry`);
    if (!catalog.includes(`\`${name}\``)) issues.push(`${name}: missing docs catalog row`);
  }
  return { ok: issues.length === 0, issues };
}

const checks = [
  { name: "validate", result: run("npm", ["run", "validate", "--", "--check-sync"]) },
  { name: "git-status", result: gitStatus() },
  { name: "catalog-consistency", result: catalogConsistency() },
];

const ok = checks.every((check) => check.result.ok);

if (json) {
  console.log(JSON.stringify({ ok, checks }, null, 2));
} else {
  console.log(ok ? "Local health passed." : "Local health failed.");
  for (const check of checks) {
    console.log(`${check.result.ok ? "ok" : "fail"}\t${check.name}`);
    if (!check.result.ok) {
      const details = check.result.suspicious || check.result.issues || check.result.stderr || check.result.error || "";
      if (Array.isArray(details)) {
        for (const item of details.slice(0, 20)) console.log(`  - ${item}`);
      } else if (details) {
        console.log(String(details).trim());
      }
    }
  }
}

process.exit(ok ? 0 : 1);
