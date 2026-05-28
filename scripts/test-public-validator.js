#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "validate-public.ps1");

function findPowerShell() {
  for (const candidate of process.platform === "win32" ? ["pwsh", "powershell"] : ["pwsh", "powershell", "pwsh.exe", "powershell.exe"]) {
    const probe = spawnSync(candidate, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function runValidator(root, extra = []) {
  const powerShell = findPowerShell();
  assert(powerShell, "PowerShell is required for public validator tests");
  return spawnSync(powerShell, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    "-RepoRoot",
    root,
    "-SkipJsonValidation",
    "-Json",
    ...extra,
  ], { encoding: "utf8" });
}

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "omx-public-validator-"));
}

function testSafeFixturePasses() {
  const root = makeRoot();
  fs.writeFileSync(path.join(root, "safe.md"), "Use {{USER_HOME}} in examples.\n", "utf8");
  const result = runValidator(root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);
}

function testLineSnippetReported() {
  const root = makeRoot();
  const unsafePath = `C:/Users/${"alice"}/project`;
  fs.writeFileSync(path.join(root, "unsafe.md"), `line one\npath ${unsafePath}\n`, "utf8");
  const result = runValidator(root);
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.issues[0].Line, 2);
  assert(payload.issues[0].Snippet.includes(unsafePath));
}

function testAllowedLiteral() {
  const root = makeRoot();
  fs.writeFileSync(path.join(root, "allowed.md"), "privateuser is allowed here for this test.\n", "utf8");
  const result = runValidator(root, ["-ForbiddenLiteral", "privateuser", "-AllowedLiteral", "privateuser"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

testSafeFixturePasses();
testLineSnippetReported();
testAllowedLiteral();
console.log("Public validator tests passed.");
