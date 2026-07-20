#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const defaultRepoRoot = path.resolve(__dirname, "..");

function getPaths(repoRoot = defaultRepoRoot) {
  const orchestratorRoot = path.join(repoRoot, "orquestrador");
  return {
    repoRoot,
    orchestratorRoot,
    skillsRoot: path.join(orchestratorRoot, "skills"),
    codexSkillsRoot: path.join(repoRoot, "codex", "skills"),
    manifestPath: path.join(orchestratorRoot, "SKILLS_MANIFEST.json"),
    routerPath: path.join(orchestratorRoot, "SKILLS_ROUTER.json"),
    aliasesPath: path.join(orchestratorRoot, "SKILL_ALIASES.json"),
    chainsPath: path.join(orchestratorRoot, "SKILL_CHAINS.json"),
    docsCatalogPath: path.join(repoRoot, "docs", "skill-catalog.md"),
    routeTestsPath: path.join(repoRoot, "tests", "routing-cases.json"),
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "mirror-everywhere" || key === "json" || key === "check-sync" || key === "check") {
      if (key === "mirror-everywhere") args.mirrorEverywhere = true;
      if (key === "json") args.json = true;
      if (key === "check-sync") args.checkSync = true;
      if (key === "check") args.check = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    index++;
    if (key === "trigger" || key === "alias") {
      args[key] = args[key] || [];
      args[key].push(value);
    } else if (key === "priority-score") {
      args.priorityScore = value;
    } else if (key === "repo-root") {
      args.repoRoot = value;
    } else {
      args[key] = value;
    }
  }
  return args;
}

function normalizeSkillName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/^\/?skill:/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertSkillName(name) {
  if (!/^skill-[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/.test(name)) {
    throw new Error(`Invalid skill name: ${name}. Use skill-<lowercase-hyphen-name>, max 64 chars.`);
  }
}

function unique(values) {
  return Array.from(new Set((values || []).map((value) => String(value).trim()).filter(Boolean)));
}

function readFrontmatter(skillFile) {
  const text = fs.readFileSync(skillFile, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    result[pair[1]] = pair[2].trim().replace(/^["']|["']$/g, "");
  }
  return result;
}

function hasHeading(text, names) {
  return names.some((name) => new RegExp(`^##\\s+.*${name}.*$`, "im").test(text));
}

function isGenericDescription(description) {
  const normalized = String(description || "").trim().toLowerCase();
  if (normalized.length < 48) return true;
  return [
    "use this skill",
    "helps with tasks",
    "general purpose",
    "todo",
    "placeholder",
    "tbd",
  ].some((marker) => normalized === marker || normalized.includes(`${marker}.`));
}

function createSkill(args) {
  const paths = getPaths(args.repoRoot ? path.resolve(args.repoRoot) : defaultRepoRoot);
  const name = normalizeSkillName(args.name);
  assertSkillName(name);

  const description = String(args.description || "").trim();
  const category = String(args.category || "").trim();
  const risk = String(args.risk || "").trim();
  const source = String(args.source || "local-patterns").trim();
  const triggers = unique(args.trigger);
  const aliases = unique(args.alias);

  if (!description || !category || !risk) {
    throw new Error("--description, --category, and --risk are required.");
  }
  if (triggers.length === 0) {
    throw new Error("At least one --trigger is required.");
  }

  const skillDir = path.join(paths.skillsRoot, name);
  const skillFile = path.join(skillDir, "SKILL.md");
  if (fs.existsSync(skillFile)) {
    throw new Error(`Skill already exists: ${skillFile}`);
  }

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    skillFile,
    `---\nname: ${name}\ndescription: ${description}\ncategory: ${category}\nrisk: ${risk}\nsource: ${source}\n---\n\n# ${name}\n\n## Core Workflow\n\n1. Identify the project context, existing patterns, and the smallest useful scope.\n2. Apply this skill only when the request matches its description or router triggers.\n3. Keep implementation details local to the target project and avoid exposing secrets or private data.\n4. Verify with the lightest meaningful command or inspection for the risk level.\n\n## Guardrails\n\n- Keep this skill compact; move long details into \`references/\` and link them from this file.\n- Do not include tokens, local paths, logs, private project names, or stale API examples.\n- Prefer project evidence over generic assumptions.\n\n## Verification\n\n- Confirm the requested behavior or decision is covered by local evidence.\n- Run the relevant project validation gate when code, config, or operational behavior changes.\n\n## Related Skills\n\n- None yet.\n`,
    "utf8"
  );

  const manifest = fs.existsSync(paths.manifestPath)
    ? readJson(paths.manifestPath)
    : { version: 1, purpose: "Canonical Orquestrador skill registry.", skills: {} };
  manifest.skills[name] = {
    description,
    category,
    risk,
    source,
    priorityScore: Number(args.priorityScore || 3),
    mirrorEverywhere: Boolean(args.mirrorEverywhere),
    triggers,
    aliases,
    status: "canonical",
    cost: risk === "high" ? "high" : risk === "medium" ? "medium" : "low",
    safety: "task-specific-guardrails",
  };
  writeJson(paths.manifestPath, manifest);

  // SKILLS_ROUTER.json and SKILL_ALIASES.json are generated from the manifest.
  buildRegistry({ repoRoot: paths.repoRoot });

  console.log(`Created ${path.relative(paths.repoRoot, skillFile)}`);
  console.log(`Updated ${path.relative(paths.repoRoot, paths.manifestPath)}, SKILLS_ROUTER.json, and SKILL_ALIASES.json`);
}

function sameDirectoryContents(left, right) {
  if (!fs.existsSync(left) || !fs.existsSync(right)) return false;
  const leftEntries = fs.readdirSync(left, { withFileTypes: true })
    .map((entry) => entry.name)
    .filter((name) => name !== ".DS_Store")
    .sort();
  const rightEntries = fs.readdirSync(right, { withFileTypes: true })
    .map((entry) => entry.name)
    .filter((name) => name !== ".DS_Store")
    .sort();
  if (leftEntries.length !== rightEntries.length) return false;
  for (let index = 0; index < leftEntries.length; index++) {
    if (leftEntries[index] !== rightEntries[index]) return false;
    const leftPath = path.join(left, leftEntries[index]);
    const rightPath = path.join(right, rightEntries[index]);
    const leftStat = fs.statSync(leftPath);
    const rightStat = fs.statSync(rightPath);
    if (leftStat.isDirectory() !== rightStat.isDirectory()) return false;
    if (leftStat.isDirectory()) {
      if (!sameDirectoryContents(leftPath, rightPath)) return false;
    } else if (fs.readFileSync(leftPath, "utf8") !== fs.readFileSync(rightPath, "utf8")) {
      return false;
    }
  }
  return true;
}

function scorePrompt(prompt, entry, aliases) {
  const text = String(prompt || "").toLowerCase();
  let score = 0;
  for (const trigger of entry.triggers || []) {
    if (text.includes(String(trigger).toLowerCase())) score += 3;
  }
  for (const alias of entry.aliases || []) {
    if (text.includes(String(alias).toLowerCase())) score += 2;
  }
  for (const [alias, skill] of Object.entries(aliases || {})) {
    if (skill === entry.name && text.includes(alias.toLowerCase())) score += 2;
  }
  return score + Number(entry.priorityScore || 0) / 100;
}

function validate(args = {}) {
  const paths = getPaths(args.repoRoot ? path.resolve(args.repoRoot) : defaultRepoRoot);
  const issues = [];
  const manifest = readJson(paths.manifestPath);
  const router = readJson(paths.routerPath);
  const aliases = readJson(paths.aliasesPath);
  const chains = readJson(paths.chainsPath);
  const docsCatalog = fs.existsSync(paths.docsCatalogPath) ? fs.readFileSync(paths.docsCatalogPath, "utf8") : "";
  const manifestSkills = manifest.skills || {};
  const routerSkills = router.skills || {};
  const descriptions = new Map();

  for (const [name, entry] of Object.entries(manifestSkills)) {
    if (normalizeSkillName(name) !== name) issues.push(`manifest:${name}: name is not normalized`);
    try {
      assertSkillName(name);
    } catch (error) {
      issues.push(`manifest:${name}: ${error.message}`);
    }
    for (const field of ["description", "category", "risk", "source", "status"]) {
      if (!entry[field]) issues.push(`manifest:${name}: missing ${field}`);
    }
    if (!Number.isFinite(Number(entry.priorityScore)) || Number(entry.priorityScore) < 1 || Number(entry.priorityScore) > 5) {
      issues.push(`manifest:${name}: priorityScore must be a number from 1 to 5`);
    }
    if (isGenericDescription(entry.description)) {
      issues.push(`manifest:${name}: description is too generic or too short`);
    }
    const normalizedDescription = String(entry.description || "").trim().toLowerCase();
    if (normalizedDescription) {
      const existing = descriptions.get(normalizedDescription) || [];
      existing.push(name);
      descriptions.set(normalizedDescription, existing);
    }

    const skillFile = path.join(paths.skillsRoot, name, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      issues.push(`skills/${name}: missing SKILL.md`);
      continue;
    }
    const text = fs.readFileSync(skillFile, "utf8");
    const frontmatter = readFrontmatter(skillFile);
    for (const field of ["name", "description", "category", "risk", "source"]) {
      if (!frontmatter[field]) issues.push(`skills/${name}/SKILL.md: missing frontmatter ${field}`);
    }
    if (frontmatter.name && frontmatter.name !== name) {
      issues.push(`skills/${name}/SKILL.md: frontmatter name does not match directory`);
    }
    if (/\b(TODO|FIXME|stub|placeholder)\b/i.test(text)) {
      issues.push(`skills/${name}/SKILL.md: contains TODO/FIXME/stub/placeholder text`);
    }
    if (/[ÃÂâ][\s\S]{0,2}/.test(text)) {
      issues.push(`skills/${name}/SKILL.md: possible mojibake`);
    }
    if (!hasHeading(text, ["Core Workflow", "Workflow", "Start Here", "Contract", "Expected Flow", "Core Rules", "Detection Contract"])) {
      issues.push(`skills/${name}/SKILL.md: missing workflow section`);
    }
    if (!hasHeading(text, ["Verification", "Validation", "Done Criteria", "Acceptance Criteria", "Completion Gate"])) {
      issues.push(`skills/${name}/SKILL.md: missing verification section`);
    }
    if (["medium", "high"].includes(String(entry.risk || "").toLowerCase()) &&
      !hasHeading(text, ["Guardrails", "Contract", "Rules", "Policy", "Controls", "Security", "Safety", "Gate", "Hard Stops", "Safe Defaults", "Permission Gates"])) {
      issues.push(`skills/${name}/SKILL.md: medium/high risk skill needs guardrails or contract section`);
    }
    if (!hasHeading(text, ["Related Skills", "Routing", "Local References"])) {
      issues.push(`skills/${name}/SKILL.md: missing related skills or routing section`);
    }
    if (!routerSkills[name]) issues.push(`router:${name}: missing router entry`);
    if (docsCatalog && !docsCatalog.includes(`\`${name}\``)) {
      issues.push(`docs/skill-catalog.md: missing ${name}`);
    }
    if (args.checkSync) {
      const codexSkillDir = path.join(paths.codexSkillsRoot, name);
      if (!fs.existsSync(path.join(codexSkillDir, "SKILL.md"))) {
        issues.push(`codex/skills/${name}: missing mirrored skill`);
      } else if (!sameDirectoryContents(path.dirname(skillFile), codexSkillDir)) {
        issues.push(`codex/skills/${name}: differs from canonical skill`);
      }
    }
  }

  for (const [description, names] of descriptions.entries()) {
    if (names.length > 1) {
      issues.push(`manifest:${names.join(",")}: duplicate description "${description}"`);
    }
  }

  for (const dirent of fs.readdirSync(paths.skillsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const name = dirent.name;
    if (!fs.existsSync(path.join(paths.skillsRoot, name, "SKILL.md"))) continue;
    if (!manifestSkills[name]) issues.push(`manifest:${name}: skill directory is not registered`);
  }

  for (const [name, entry] of Object.entries(routerSkills)) {
    if (!manifestSkills[name]) issues.push(`router:${name}: no manifest entry`);
    for (const field of ["description", "triggers", "canonicalPath", "codexPath", "cost", "safety"]) {
      if (!entry[field]) issues.push(`router:${name}: missing ${field}`);
    }
    if (!Array.isArray(entry.triggers) || entry.triggers.length === 0) {
      issues.push(`router:${name}: triggers must be a non-empty array`);
    }
  }

  for (const [alias, skill] of Object.entries(aliases.aliases || {})) {
    if (!manifestSkills[skill]) issues.push(`aliases:${alias}: points to missing skill ${skill}`);
  }

  for (const [skill, chain] of Object.entries(chains.chains || {})) {
    if (!manifestSkills[skill]) issues.push(`chains:${skill}: chain owner is not in manifest`);
    if (!chain.reasons || typeof chain.reasons !== "object") {
      issues.push(`chains:${skill}: missing reasons object`);
    }
    for (const target of chain.mayInvoke || []) {
      if (!manifestSkills[target]) issues.push(`chains:${skill}: mayInvoke points to missing skill ${target}`);
      if (!chain.reasons || !chain.reasons[target]) {
        issues.push(`chains:${skill}: missing reason for ${target}`);
      }
    }
  }

  if (fs.existsSync(paths.routeTestsPath)) {
    const routeTests = readJson(paths.routeTestsPath);
    for (const testCase of routeTests.cases || []) {
      const scores = Object.entries(manifestSkills).map(([name, entry]) => [
        name,
        scorePrompt(testCase.prompt, { ...entry, name }, aliases.aliases || {}),
      ]).filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]);
      const top = scores.slice(0, Number(testCase.top || 3)).map(([name]) => name);
      for (const expected of testCase.expected || []) {
        if (!top.includes(expected)) {
          issues.push(`routing:${testCase.name || testCase.prompt}: expected ${expected} in top ${testCase.top || 3}, got ${top.join(", ") || "none"}`);
        }
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues: issues.sort(), skillCount: Object.keys(manifestSkills).length };
  }
  return { ok: true, issues: [], skillCount: Object.keys(manifestSkills).length };
}

function listSkills(args = {}) {
  const paths = getPaths(args.repoRoot ? path.resolve(args.repoRoot) : defaultRepoRoot);
  const manifest = readJson(paths.manifestPath);
  return Object.entries(manifest.skills || {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, entry]) => ({
    name,
    description: entry.description,
    category: entry.category,
    risk: entry.risk,
    priorityScore: entry.priorityScore,
    mirrorEverywhere: Boolean(entry.mirrorEverywhere),
  }));
}

function printMirrorEverywhere(args = {}) {
  const paths = getPaths(args.repoRoot ? path.resolve(args.repoRoot) : defaultRepoRoot);
  const manifest = readJson(paths.manifestPath);
  for (const [name, entry] of Object.entries(manifest.skills || {})) {
    if (entry.mirrorEverywhere) console.log(name);
  }
}

function generatedRouterSkills(manifestSkills) {
  const skills = {};
  for (const [name, entry] of Object.entries(manifestSkills || {})) {
    skills[name] = {
      description: entry.description,
      triggers: entry.triggers || [],
      canonicalPath: `{{USER_HOME}}/.orquestrador/skills/${name}/SKILL.md`,
      codexPath: `{{USER_HOME}}/.codex/skills/${name}/SKILL.md`,
      cost: entry.cost,
      safety: entry.safety,
    };
  }
  return skills;
}

function generatedAliases(manifestSkills) {
  const aliases = {};
  for (const [name, entry] of Object.entries(manifestSkills || {})) {
    for (const alias of entry.aliases || []) {
      aliases[alias] = name;
    }
  }
  return aliases;
}

// Order-independent structural comparison so drift is detected by content,
// not by key order or formatting.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// SKILLS_MANIFEST.json is the single source of truth. SKILLS_ROUTER.json and
// SKILL_ALIASES.json are generated from it. `--check` fails on drift instead of writing.
function buildRegistry(args = {}) {
  const paths = getPaths(args.repoRoot ? path.resolve(args.repoRoot) : defaultRepoRoot);
  const manifestSkills = readJson(paths.manifestPath).skills || {};
  const router = readJson(paths.routerPath);
  const aliasesDoc = readJson(paths.aliasesPath);

  const nextRouterSkills = generatedRouterSkills(manifestSkills);
  const nextAliases = generatedAliases(manifestSkills);

  if (args.check) {
    const issues = [];
    if (stableStringify(router.skills || {}) !== stableStringify(nextRouterSkills)) {
      issues.push("SKILLS_ROUTER.json is out of sync with SKILLS_MANIFEST.json (run: skill-catalog.js build-registry)");
    }
    if (stableStringify(aliasesDoc.aliases || {}) !== stableStringify(nextAliases)) {
      issues.push("SKILL_ALIASES.json is out of sync with SKILLS_MANIFEST.json (run: skill-catalog.js build-registry)");
    }
    return { ok: issues.length === 0, issues, changed: [] };
  }

  router.skills = nextRouterSkills;
  writeJson(paths.routerPath, router);
  aliasesDoc.aliases = nextAliases;
  writeJson(paths.aliasesPath, aliasesDoc);
  return { ok: true, issues: [], changed: ["SKILLS_ROUTER.json", "SKILL_ALIASES.json"] };
}

function runCli(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  try {
    const args = parseArgs(rest);
    if (command === "new") createSkill(args);
    else if (command === "validate") {
      const result = validate(args);
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else if (result.ok) console.log(`Skill validation passed. Skills: ${result.skillCount}`);
      else {
        console.error("Skill validation failed:");
        for (const issue of result.issues) console.error(`  - ${issue}`);
      }
      return result.ok ? 0 : 1;
    } else if (command === "list") {
      const skills = listSkills(args);
      if (args.json) console.log(JSON.stringify({ skills }, null, 2));
      else for (const skill of skills) console.log(`${skill.name}\t${skill.category}\t${skill.risk}\t${skill.priorityScore || ""}\t${skill.description}`);
    } else if (command === "mirror-everywhere") printMirrorEverywhere(args);
    else if (command === "build-registry") {
      const result = buildRegistry(args);
      if (args.check) {
        if (result.ok) console.log("Registry in sync with SKILLS_MANIFEST.json.");
        else {
          console.error("Registry drift detected:");
          for (const issue of result.issues) console.error(`  - ${issue}`);
        }
        return result.ok ? 0 : 1;
      }
      console.log(`Registry rebuilt from manifest: ${result.changed.join(", ")}`);
    } else {
      console.error("Usage: skill-catalog.js <new|validate|list|mirror-everywhere|build-registry> [options]");
      return 2;
    }
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (require.main === module) {
  process.exit(runCli());
}

module.exports = {
  assertSkillName,
  buildRegistry,
  hasHeading,
  isGenericDescription,
  listSkills,
  normalizeSkillName,
  scorePrompt,
  validate,
  runCli,
};
