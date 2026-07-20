#!/usr/bin/env node
"use strict";

// Context budget guard.
//
// Measures the "session boot" cost: the files an AI loads on every session
// before it opens any task-specific SKILL.md, following the read contract in
// orquestrador/maestro.md, hooks.md, and docs/context-economy.md.
//
// The goal is to prevent silent regressions: every new skill inflates the
// router/aliases and every rule edit inflates the contracts. This fails the
// build when the always-loaded boot cost crosses a token ceiling.
//
// Usage:
//   node scripts/context-budget.js            # report only
//   node scripts/context-budget.js --json     # machine-readable envelope
//   node scripts/context-budget.js --max 9000 # fail if boot exceeds N tokens

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const json = process.argv.includes("--json");
const maxIndex = process.argv.indexOf("--max");
const DEFAULT_MAX_TOKENS = 12000;
const maxTokens = maxIndex !== -1 ? Number(process.argv[maxIndex + 1]) : DEFAULT_MAX_TOKENS;

// Rough bytes-per-token used across the project's economy notes.
const BYTES_PER_TOKEN = 4;

// Always loaded on every session, before any task-specific skill body.
const ALWAYS = [
  "home/AGENTS.md",
  "orquestrador/rules.md",
  "orquestrador/maestro.md",
  "orquestrador/hooks.md",
  "orquestrador/SKILLS_INDEX.md",
  "orquestrador/SKILL_EXECUTION_PROFILES.json",
  "orquestrador/SKILL_ALIASES.json",
  "orquestrador/SKILLS_ROUTER.json",
];

// Loaded on demand, not part of the always-on boot cost. Reported for context.
const DEFERRED = [
  "orquestrador/SKILL_CHAINS.json",
];

function measure(relPaths) {
  return relPaths.map((rel) => {
    const abs = path.join(repoRoot, rel);
    const bytes = fs.existsSync(abs) ? fs.statSync(abs).size : 0;
    return { file: rel, bytes, tokens: Math.round(bytes / BYTES_PER_TOKEN), missing: !fs.existsSync(abs) };
  });
}

const always = measure(ALWAYS);
const deferred = measure(DEFERRED);
const bootBytes = always.reduce((sum, f) => sum + f.bytes, 0);
const bootTokens = Math.round(bootBytes / BYTES_PER_TOKEN);
const overBudget = bootTokens > maxTokens;

if (json) {
  console.log(JSON.stringify({
    ok: !overBudget,
    maxTokens,
    bootBytes,
    bootTokens,
    always,
    deferred,
  }, null, 2));
} else {
  console.log(`Context boot budget (always-loaded files):`);
  for (const f of [...always].sort((a, b) => b.bytes - a.bytes)) {
    console.log(`  ${String(f.tokens).padStart(6)} tok  ${String(f.bytes).padStart(7)} B  ${f.file}${f.missing ? "  (MISSING)" : ""}`);
  }
  console.log(`  ${"-".repeat(40)}`);
  console.log(`  ${String(bootTokens).padStart(6)} tok  ${String(bootBytes).padStart(7)} B  TOTAL (max ${maxTokens})`);
  console.log(`Deferred (loaded on demand, not in boot budget):`);
  for (const f of deferred) {
    console.log(`  ${String(f.tokens).padStart(6)} tok  ${String(f.bytes).padStart(7)} B  ${f.file}`);
  }
  console.log(overBudget
    ? `\nFAIL: boot budget ${bootTokens} tok exceeds ${maxTokens} tok.`
    : `\nOK: boot budget ${bootTokens} tok within ${maxTokens} tok.`);
}

process.exit(overBudget ? 1 : 0);
