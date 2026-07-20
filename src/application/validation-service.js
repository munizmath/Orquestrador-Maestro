"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { validateSkills } = require("./skill-service.js");

function runCommand(command, args, repoRoot) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    durationMs: Date.now() - started,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}

function validateProject(repoRoot, options = {}) {
  const checks = [];
  const skillResult = validateSkills(repoRoot, { checkSync: options.checkSync });
  checks.push({
    name: "skills",
    ok: skillResult.ok,
    durationMs: 0,
    issues: skillResult.issues,
  });

  if (options.includePackageCheck) {
    const packageCheck = runCommand(process.execPath, [path.join(repoRoot, "scripts", "package-check.js")], repoRoot);
    checks.push({
      name: "package",
      ok: packageCheck.ok,
      durationMs: packageCheck.durationMs,
      issues: packageCheck.ok ? [] : [{
        schemaVersion: 1,
        severity: "error",
        category: "package",
        code: "package_check_failed",
        message: packageCheck.stderr || packageCheck.stdout || packageCheck.error || "Package check failed",
      }],
    });
  }

  return {
    schemaVersion: 1,
    ok: checks.every((check) => check.ok),
    validator: "project",
    checks,
    issues: checks.flatMap((check) => check.issues || []),
  };
}

module.exports = {
  validateProject,
};
