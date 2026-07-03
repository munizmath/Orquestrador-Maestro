#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function printHelp() {
  console.log(`DEV context tools

Usage:
  node dev-context-tools.js compact-worklog [--project-path PATH] [--keep N]
  node dev-context-tools.js check-dev-gates [--project-path PATH] [--max-entries N] [--strict]
`);
}

function parseArgs(argv) {
  const args = [];
  for (const arg of argv) {
    if (arg.startsWith("--") && arg.includes("=")) {
      const index = arg.indexOf("=");
      args.push(arg.slice(0, index), arg.slice(index + 1));
    } else {
      args.push(arg);
    }
  }
  return args;
}

function readOptions(args, allowedFlags) {
  const normalized = parseArgs(args);
  const options = {};

  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    const def = allowedFlags[arg];
    if (!def) {
      throw new Error(`Unknown parameter: ${arg}`);
    }

    if (def.value) {
      const value = normalized[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Parameter ${arg} requires a value.`);
      }
      options[def.key] = value;
      i += 1;
      continue;
    }

    options[def.key] = true;
  }

  return options;
}

function ensureInteger(value, label, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function resolveDevRoot(projectPathOption) {
  const projectRoot = path.resolve(projectPathOption || process.cwd());
  const devRoot = path.join(projectRoot, "DEV");
  if (!fs.existsSync(devRoot) || !fs.statSync(devRoot).isDirectory()) {
    throw new Error(`DEV directory not found: ${devRoot}`);
  }
  return { projectRoot, devRoot };
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function writeUtf8(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content.replace(/\r\n/g, "\n").replace(/\s+$/u, "")}\n`, "utf8");
}

function trimTrailingBlankLines(lines) {
  const result = [...lines];
  while (result.length > 0 && result[result.length - 1].trim() === "") {
    result.pop();
  }
  return result;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseWorklog(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const preamble = [];
  const entries = [];
  let inFence = false;
  let current = null;

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
    }

    const isEntryHeader = !inFence && /^## /.test(line) && !/^## Template\b/.test(line);
    if (isEntryHeader) {
      if (current) {
        current.lines = trimTrailingBlankLines(current.lines);
        current.raw = current.lines.join("\n");
        entries.push(current);
      }
      current = {
        header: line.trim(),
        lines: [line]
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }

  if (current) {
    current.lines = trimTrailingBlankLines(current.lines);
    current.raw = current.lines.join("\n");
    entries.push(current);
  }

  return {
    preamble: trimTrailingBlankLines(preamble),
    entries
  };
}

function extractBullet(entryRaw, label) {
  const pattern = new RegExp(`^-\\s*${escapeRegex(label)}:\\s*(.+)$`, "im");
  const match = entryRaw.match(pattern);
  return match ? match[1].trim() : "";
}

function extractSection(content, heading) {
  const pattern = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, "m");
  const match = content.match(pattern);
  return match ? match[1].trim() : "";
}

function hasMeaningfulSectionContent(content, heading) {
  const section = extractSection(content, heading);
  if (!section) {
    return false;
  }

  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "-" || trimmed.startsWith("```")) {
      continue;
    }

    const normalized = trimmed.replace(/^-\s*/, "").trim();
    if (!normalized) {
      continue;
    }

    if (/^[A-Za-z][A-Za-z /-]*:\s*$/.test(normalized)) {
      continue;
    }

    return true;
  }

  return false;
}

function isPlaceholderValue(value) {
  if (!value) {
    return true;
  }

  const normalized = value.trim();
  return normalized.startsWith("[") && normalized.endsWith("]");
}

function relativeToDev(devRoot, filePath) {
  return path.relative(devRoot, filePath).replace(/\\/g, "/");
}

function buildArchiveContent(existingPreamble, entries) {
  const header = existingPreamble && existingPreamble.length > 0
    ? existingPreamble.join("\n").trim()
    : [
      "# Worklog Archive",
      "",
      "Older worklog entries moved out of `DEV/WORKLOG.md` by `compact-worklog`.",
      "",
      "Read `DEV/HANDOFF.md` and the retained `DEV/WORKLOG.md` entries before opening this archive."
    ].join("\n");

  if (entries.length === 0) {
    return header.trim();
  }

  return `${header.trim()}\n\n${entries.map((entry) => entry.raw.trim()).join("\n\n")}`.trim();
}

function buildWorklogContent(preambleLines, entries) {
  const parts = [];
  const trimmedPreamble = trimTrailingBlankLines(preambleLines);
  if (trimmedPreamble.length > 0) {
    parts.push(trimmedPreamble.join("\n").trim());
  }
  if (entries.length > 0) {
    parts.push(entries.map((entry) => entry.raw.trim()).join("\n\n"));
  }
  return parts.join("\n\n").trim();
}

function buildHandoffContent(devRoot, retainedEntries, archiveFile) {
  const handoffPath = path.join(devRoot, "HANDOFF.md");
  const specPath = path.join(devRoot, "SPECS", "ACTIVE.md");
  const verifyPath = path.join(devRoot, "VERIFY.md");
  const latest = retainedEntries[retainedEntries.length - 1] || null;
  const recentEntries = retainedEntries.slice(-3).reverse();

  const latestTitle = latest ? latest.header.replace(/^##\s+/, "").trim() : "No substantive entry yet";
  const latestSpec = latest ? extractBullet(latest.raw, "Spec") : "";
  const latestChanged = latest ? extractBullet(latest.raw, "Changed") : "";
  const latestVerified = latest ? extractBullet(latest.raw, "Verified") : "";
  const latestRisks = latest ? (extractBullet(latest.raw, "Risks") || extractBullet(latest.raw, "Risk")) : "";
  const latestNext = latest ? extractBullet(latest.raw, "Next context") : "";

  const lines = [
    "# Active Handoff",
    "",
    "This file should stay small. Refresh it after substantive work or run `orquestrador-maestro compact-worklog`.",
    "",
    "## Snapshot",
    "",
    `- Updated: ${new Date().toISOString()}`,
    "- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`",
    `- Active spec: ${fs.existsSync(specPath) ? `\`${relativeToDev(devRoot, specPath)}\`` : "[missing]"}`,
    `- Verification source: ${fs.existsSync(verifyPath) ? `\`${relativeToDev(devRoot, verifyPath)}\`` : "[missing]"}`,
    `- Worklog archive: \`${relativeToDev(devRoot, archiveFile)}\``,
    "",
    "## Latest Work",
    "",
    `- Entry: ${latestTitle}`,
    `- Spec: ${latestSpec || (fs.existsSync(specPath) ? "`SPECS/ACTIVE.md`" : "[define the active spec]")}`,
    `- Changed: ${latestChanged || "[update from the latest worklog entry]"}`,
    `- Verified: ${latestVerified || "[record the latest verification in VERIFY.md]"}`,
    `- Risks: ${latestRisks || "[list only active risks]"}`,
    `- Next context: ${latestNext || "[state the next concrete step]"}`,
    "",
    "## Recent Entries",
    ""
  ];

  if (recentEntries.length === 0) {
    lines.push("- No substantive worklog entry yet.");
  } else {
    for (const entry of recentEntries) {
      lines.push(`- ${entry.header.replace(/^##\s+/, "").trim()}`);
    }
  }

  return lines.join("\n").trim();
}

function compactWorklog(options) {
  const { projectRoot, devRoot } = resolveDevRoot(options.projectPath);
  const keepEntries = ensureInteger(options.keep, "Keep entries", 12);
  const worklogPath = path.join(devRoot, "WORKLOG.md");
  const archivePath = path.join(devRoot, "HANDOFFS", "WORKLOG_ARCHIVE.md");
  const handoffPath = path.join(devRoot, "HANDOFF.md");

  if (!fs.existsSync(worklogPath)) {
    throw new Error(`WORKLOG not found: ${worklogPath}`);
  }

  const parsedWorklog = parseWorklog(readUtf8(worklogPath));
  const originalEntries = parsedWorklog.entries;
  const retainedEntries = originalEntries.slice(-keepEntries);
  const overflowEntries = originalEntries.slice(0, Math.max(0, originalEntries.length - keepEntries));

  let archivedCount = 0;
  if (overflowEntries.length > 0) {
    const existingArchive = fs.existsSync(archivePath)
      ? parseWorklog(readUtf8(archivePath))
      : { preamble: [], entries: [] };
    const knownEntries = new Set(existingArchive.entries.map((entry) => entry.raw));
    const mergedEntries = [...existingArchive.entries];
    for (const entry of overflowEntries) {
      if (!knownEntries.has(entry.raw)) {
        mergedEntries.push(entry);
        knownEntries.add(entry.raw);
        archivedCount += 1;
      }
    }
    writeUtf8(archivePath, buildArchiveContent(existingArchive.preamble, mergedEntries));
  } else if (!fs.existsSync(archivePath)) {
    writeUtf8(archivePath, buildArchiveContent([], []));
  }

  writeUtf8(worklogPath, buildWorklogContent(parsedWorklog.preamble, retainedEntries));
  writeUtf8(handoffPath, buildHandoffContent(devRoot, retainedEntries, archivePath));

  console.log("Worklog compaction complete.");
  console.log(`ProjectPath: ${projectRoot}`);
  console.log(`DevPath: ${devRoot}`);
  console.log(`OriginalEntries: ${originalEntries.length}`);
  console.log(`RetainedEntries: ${retainedEntries.length}`);
  console.log(`ArchivedEntries: ${archivedCount}`);
  console.log(`Worklog: ${worklogPath}`);
  console.log(`Handoff: ${handoffPath}`);
  console.log(`Archive: ${archivePath}`);
}

function assertFile(issues, filePath, label) {
  if (!fs.existsSync(filePath)) {
    issues.push(`${label} missing: ${filePath}`);
  }
}

function assertContains(issues, filePath, needle, label) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = readUtf8(filePath);
  if (!content.includes(needle)) {
    issues.push(`${label} missing expected marker \`${needle}\`: ${filePath}`);
  }
}

function assertHeading(issues, filePath, heading, label) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = readUtf8(filePath);
  const pattern = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "m");
  if (!pattern.test(content)) {
    issues.push(`${label} missing heading \`## ${heading}\`: ${filePath}`);
  }
}

function checkDevGates(options) {
  const { projectRoot, devRoot } = resolveDevRoot(options.projectPath);
  const strict = Boolean(options.strict);
  const maxEntries = ensureInteger(options.maxEntries, "Max entries", 12);

  const requiredPaths = {
    readme: path.join(devRoot, "README.md"),
    index: path.join(devRoot, "INDEX.md"),
    handoff: path.join(devRoot, "HANDOFF.md"),
    context: path.join(devRoot, "CONTEXT.md"),
    worklog: path.join(devRoot, "WORKLOG.md"),
    verify: path.join(devRoot, "VERIFY.md"),
    spec: path.join(devRoot, "SPECS", "ACTIVE.md")
  };

  const issues = [];
  const warnings = [];

  for (const [label, filePath] of Object.entries(requiredPaths)) {
    assertFile(issues, filePath, `DEV ${label}`);
  }

  assertContains(issues, requiredPaths.index, "HANDOFF.md", "DEV index");
  assertContains(issues, requiredPaths.index, "WORKLOG.md", "DEV index");
  assertContains(issues, requiredPaths.index, "VERIFY.md", "DEV index");
  assertContains(issues, requiredPaths.index, "SPECS/ACTIVE.md", "DEV index");

  assertHeading(issues, requiredPaths.handoff, "Snapshot", "DEV handoff");
  assertHeading(issues, requiredPaths.handoff, "Latest Work", "DEV handoff");
  assertHeading(issues, requiredPaths.handoff, "Recent Entries", "DEV handoff");

  assertHeading(issues, requiredPaths.context, "State", "DEV context");
  assertHeading(issues, requiredPaths.context, "Commands", "DEV context");
  assertHeading(issues, requiredPaths.context, "Constraints And Risks", "DEV context");
  assertHeading(issues, requiredPaths.context, "Next Context", "DEV context");

  assertHeading(issues, requiredPaths.verify, "Latest Verification", "DEV verify");
  assertHeading(issues, requiredPaths.verify, "Commands", "DEV verify");
  assertHeading(issues, requiredPaths.verify, "Outcome", "DEV verify");

  assertHeading(issues, requiredPaths.spec, "Goal", "DEV active spec");
  assertHeading(issues, requiredPaths.spec, "In Scope", "DEV active spec");
  assertHeading(issues, requiredPaths.spec, "Out Of Scope", "DEV active spec");
  assertHeading(issues, requiredPaths.spec, "Acceptance", "DEV active spec");
  assertHeading(issues, requiredPaths.spec, "Verification Plan", "DEV active spec");
  assertHeading(issues, requiredPaths.spec, "Status", "DEV active spec");

  if (strict && fs.existsSync(requiredPaths.handoff)) {
    const handoffContent = readUtf8(requiredPaths.handoff);
    const handoffChecks = [
      ["Updated", extractBullet(handoffContent, "Updated")],
      ["Entry", extractBullet(handoffContent, "Entry")],
      ["Spec", extractBullet(handoffContent, "Spec")],
      ["Changed", extractBullet(handoffContent, "Changed")],
      ["Verified", extractBullet(handoffContent, "Verified")],
      ["Next context", extractBullet(handoffContent, "Next context")]
    ];

    for (const [label, value] of handoffChecks) {
      if (isPlaceholderValue(value)) {
        issues.push(`DEV handoff has placeholder or empty \`${label}:\` in ${requiredPaths.handoff}`);
      }
    }
  }

  if (strict && fs.existsSync(requiredPaths.verify)) {
    const verifyContent = readUtf8(requiredPaths.verify);
    if (isPlaceholderValue(extractBullet(verifyContent, "Date"))) {
      issues.push(`DEV verify has placeholder or empty \`Date:\` in ${requiredPaths.verify}`);
    }
    if (isPlaceholderValue(extractBullet(verifyContent, "Scope"))) {
      issues.push(`DEV verify has placeholder or empty \`Scope:\` in ${requiredPaths.verify}`);
    }
    if (!hasMeaningfulSectionContent(verifyContent, "Commands")) {
      issues.push(`DEV verify has no substantive \`## Commands\` content in ${requiredPaths.verify}`);
    }
    const verifyOutcomeFields = ["Passed", "Failed", "Pending"];
    const hasOutcome = verifyOutcomeFields.some((label) => !isPlaceholderValue(extractBullet(verifyContent, label)));
    if (!hasOutcome) {
      issues.push(`DEV verify has no substantive outcome values in ${requiredPaths.verify}`);
    }
  }

  if (strict && fs.existsSync(requiredPaths.spec)) {
    const specContent = readUtf8(requiredPaths.spec);
    const requiredSections = ["Goal", "In Scope", "Acceptance", "Verification Plan"];
    for (const heading of requiredSections) {
      if (!hasMeaningfulSectionContent(specContent, heading)) {
        issues.push(`DEV active spec has no substantive \`## ${heading}\` content in ${requiredPaths.spec}`);
      }
    }
  }

  let worklogEntries = [];
  if (fs.existsSync(requiredPaths.worklog)) {
    worklogEntries = parseWorklog(readUtf8(requiredPaths.worklog)).entries;
    if (worklogEntries.length > maxEntries) {
      issues.push(`DEV worklog has ${worklogEntries.length} entries (> ${maxEntries}). Run compact-worklog.`);
    }
    if (worklogEntries.length === 0) {
      const message = "DEV worklog has no substantive entry yet.";
      if (strict) {
        issues.push(message);
      } else {
        warnings.push(message);
      }
    }
  }

  const latestEntry = worklogEntries[worklogEntries.length - 1];
  if (latestEntry) {
    const requiredBullets = ["Spec", "Changed", "Verified", "Next context"];
    for (const bullet of requiredBullets) {
      const value = extractBullet(latestEntry.raw, bullet);
      if (!value) {
        const message = `Latest worklog entry is missing \`${bullet}:\` in ${requiredPaths.worklog}`;
        if (strict) {
          issues.push(message);
        } else {
          warnings.push(message);
        }
      }
    }
  }

  if (issues.length > 0) {
    console.error("DEV gates failed.");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    if (warnings.length > 0) {
      console.error("Warnings:");
      for (const warning of warnings) {
        console.error(`- ${warning}`);
      }
    }
    process.exit(1);
  }

  console.log("DEV gates passed.");
  console.log(`ProjectPath: ${projectRoot}`);
  console.log(`DevPath: ${devRoot}`);
  console.log(`Strict: ${strict}`);
  console.log(`WorklogEntries: ${worklogEntries.length}`);
  console.log(`MaxEntries: ${maxEntries}`);
  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }
}

function main() {
  const [command = "--help", ...rest] = process.argv.slice(2);

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  if (command === "compact-worklog") {
    const options = readOptions(rest, {
      "--project-path": { key: "projectPath", value: true },
      "--keep": { key: "keep", value: true }
    });
    compactWorklog(options);
    return;
  }

  if (command === "check-dev-gates") {
    const options = readOptions(rest, {
      "--project-path": { key: "projectPath", value: true },
      "--max-entries": { key: "maxEntries", value: true },
      "--strict": { key: "strict", value: false }
    });
    checkDevGates(options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
