#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "orquestrador-maestro.js");

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    shell: false,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });
}

function parseJsonStdout(result) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`CLI stdout is not valid JSON: ${error.message}\n${result.stdout}`);
  }
}

function assertExit(result, expectedStatus = 0) {
  if (result.status !== expectedStatus) {
    throw new Error(`Expected exit ${expectedStatus}, got ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}

function assertJsonEnvelope(value) {
  for (const key of ["ok", "command", "timestamp", "durationMs", "data", "issues", "warnings"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error(`Missing JSON envelope key: ${key}`);
    }
  }
  if (!Array.isArray(value.issues) || !Array.isArray(value.warnings)) {
    throw new Error("JSON envelope issues and warnings must be arrays.");
  }
  return value;
}

module.exports = {
  repoRoot,
  cliPath,
  runCli,
  parseJsonStdout,
  assertExit,
  assertJsonEnvelope,
};
