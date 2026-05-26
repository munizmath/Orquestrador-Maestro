#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: options.quiet ? "ignore" : "inherit",
    shell: false,
  });

  if (result.error) {
    return { ok: false, error: result.error };
  }

  return { ok: result.status === 0, status: result.status };
}

function findPowerShell() {
  const candidates = process.platform === "win32"
    ? ["pwsh", "powershell"]
    : ["pwsh", "powershell", "pwsh.exe", "powershell.exe"];

  for (const candidate of candidates) {
    const probe = run(candidate, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], { quiet: true });
    if (probe.ok) {
      return candidate;
    }
  }

  return null;
}

const powerShell = findPowerShell();
if (!powerShell) {
  console.error("Unable to find PowerShell. Install PowerShell 7 (`pwsh`) or make Windows PowerShell available.");
  process.exit(1);
}

const publicValidation = run(powerShell, [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  path.join(repoRoot, "scripts", "validate-public.ps1"),
]);
if (!publicValidation.ok) {
  process.exit(publicValidation.status || 1);
}

const skillValidation = run(process.execPath, [
  path.join(repoRoot, "scripts", "skill-catalog.js"),
  "validate",
]);
if (!skillValidation.ok) {
  process.exit(skillValidation.status || 1);
}
