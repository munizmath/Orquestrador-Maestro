"use strict";

const { listSkills, scorePrompt, validate } = require("../../scripts/skill-catalog.js");
const { hashText } = require("../core/security.js");

function getSkills(repoRoot) {
  return listSkills({ repoRoot }).map((skill) => ({
    schemaVersion: 1,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    risk: skill.risk,
    priorityScore: skill.priorityScore || 1,
    mirrorEverywhere: Boolean(skill.mirrorEverywhere),
    readiness: "cataloged",
  }));
}

function validateSkills(repoRoot, options = {}) {
  const result = validate({ repoRoot, checkSync: Boolean(options.checkSync) });
  return {
    schemaVersion: 1,
    ok: result.ok,
    validator: "skill-catalog",
    skillCount: result.skillCount,
    issues: (result.issues || []).map((message) => ({
      schemaVersion: 1,
      severity: "error",
      category: "skills",
      code: "skill_validation",
      message,
    })),
  };
}

function routePrompt(prompt, repoRoot, top = 5) {
  const scores = scorePrompt(prompt || "", { repoRoot }).slice(0, top);
  return {
    schemaVersion: 1,
    promptHash: hashText(prompt || ""),
    skills: scores.map(([name, score]) => ({
      name,
      score,
      reason: `matched prompt with score ${score}`,
    })),
  };
}

module.exports = {
  getSkills,
  validateSkills,
  routePrompt,
};
