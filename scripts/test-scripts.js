#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validate } = require("./skill-catalog.js");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeSkill(root, name, body) {
  const dir = path.join(root, "orquestrador", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), body, "utf8");
}

function baseRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omx-skill-test-"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "codex", "skills"), { recursive: true });
  writeJson(path.join(root, "orquestrador", "SKILLS_ROUTER.json"), { version: 1, skills: {} });
  writeJson(path.join(root, "orquestrador", "SKILL_ALIASES.json"), { version: 1, aliases: {} });
  writeJson(path.join(root, "orquestrador", "SKILL_CHAINS.json"), { version: 1, chains: {} });
  fs.writeFileSync(path.join(root, "docs", "skill-catalog.md"), "", "utf8");
  return root;
}

function validSkillText(name, description) {
  return `---\nname: ${name}\ndescription: ${description}\ncategory: testing\nrisk: medium\nsource: test\n---\n\n# ${name}\n\n## Core Workflow\n\n1. Inspect evidence.\n\n## Guardrails\n\n- Keep secrets out.\n\n## Verification\n\n- Run the test.\n\n## Related Skills\n\n- None.\n`;
}

function makeValidRepo() {
  const root = baseRepo();
  const name = "skill-valid-example";
  const description = "Validate example skills with clear workflow, guardrails, verification, and catalog coverage.";
  writeJson(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), {
    version: 1,
    skills: {
      [name]: {
        description,
        category: "testing",
        risk: "medium",
        source: "test",
        priorityScore: 3,
        mirrorEverywhere: true,
        triggers: ["valid example"],
        aliases: ["valid"],
        status: "canonical",
      },
    },
  });
  writeJson(path.join(root, "orquestrador", "SKILLS_ROUTER.json"), {
    version: 1,
    skills: {
      [name]: {
        description,
        triggers: ["valid example"],
        canonicalPath: `{{USER_HOME}}/.orquestrador/skills/${name}/SKILL.md`,
        codexPath: `{{USER_HOME}}/.codex/skills/${name}/SKILL.md`,
        cost: "medium",
        safety: "test",
      },
    },
  });
  fs.writeFileSync(path.join(root, "docs", "skill-catalog.md"), `| \`${name}\` | testing | medium | ${description} |\n`, "utf8");
  writeSkill(root, name, validSkillText(name, description));
  fs.mkdirSync(path.join(root, "codex", "skills", name), { recursive: true });
  fs.copyFileSync(
    path.join(root, "orquestrador", "skills", name, "SKILL.md"),
    path.join(root, "codex", "skills", name, "SKILL.md")
  );
  return { root, name };
}

function testValidSkillPasses() {
  const { root } = makeValidRepo();
  const result = validate({ repoRoot: root, checkSync: true });
  assert.equal(result.ok, true, result.issues.join("\n"));
}

function testMissingVerificationFails() {
  const { root, name } = makeValidRepo();
  const file = path.join(root, "orquestrador", "skills", name, "SKILL.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("## Verification", "## Evidence"), "utf8");
  const result = validate({ repoRoot: root });
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.includes("missing verification")));
}

function testMissingGuardrailsFails() {
  const { root, name } = makeValidRepo();
  const file = path.join(root, "orquestrador", "skills", name, "SKILL.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("## Guardrails", "## Notes"), "utf8");
  const result = validate({ repoRoot: root });
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.includes("needs guardrails")));
}

function testDuplicateDescriptionFails() {
  const { root, name } = makeValidRepo();
  const manifestPath = path.join(root, "orquestrador", "SKILLS_MANIFEST.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.skills["skill-valid-copy"] = { ...manifest.skills[name], triggers: ["copy"], aliases: ["copy"] };
  writeJson(manifestPath, manifest);
  writeSkill(root, "skill-valid-copy", validSkillText("skill-valid-copy", manifest.skills[name].description));
  const router = JSON.parse(fs.readFileSync(path.join(root, "orquestrador", "SKILLS_ROUTER.json"), "utf8"));
  router.skills["skill-valid-copy"] = { ...router.skills[name], triggers: ["copy"] };
  writeJson(path.join(root, "orquestrador", "SKILLS_ROUTER.json"), router);
  fs.appendFileSync(path.join(root, "docs", "skill-catalog.md"), `| \`skill-valid-copy\` | testing | medium | copy |\n`);
  const result = validate({ repoRoot: root });
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.includes("duplicate description")));
}

function run() {
  testValidSkillPasses();
  testMissingVerificationFails();
  testMissingGuardrailsFails();
  testDuplicateDescriptionFails();
  console.log("Script tests passed.");
}

run();
