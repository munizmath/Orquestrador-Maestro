"use strict";

const os = require("node:os");
const { getSkills } = require("./skill-service.js");
const { validateProject } = require("./validation-service.js");
const { listRuns } = require("./run-registry.js");
const { planMigrations } = require("../infrastructure/migrations.js");
const { createLocalStore } = require("../infrastructure/local-store.js");

function issue(severity, category, code, message, recommendation = null) {
  return { schemaVersion: 1, severity, category, code, message, recommendation };
}

function buildRunsViewModel(store) {
  const runs = listRuns(store).slice(0, 50);
  return {
    schemaVersion: 1,
    count: runs.length,
    recent: runs.map((run) => ({
      id: run.id,
      kind: run.kind,
      status: run.status,
      startedAt: run.startedAt,
      durationMs: run.durationMs,
      summary: run.summary,
    })),
  };
}

function buildSkillsViewModel(repoRoot) {
  const skills = getSkills(repoRoot);
  const byRisk = skills.reduce((acc, skill) => {
    acc[skill.risk] = (acc[skill.risk] || 0) + 1;
    return acc;
  }, {});
  return {
    schemaVersion: 1,
    count: skills.length,
    byRisk,
    skills,
  };
}

function buildStatusViewModel(repoRoot, options = {}) {
  const store = options.store || createLocalStore({ repoRoot, rootDir: options.stateDir || undefined });
  const migration = planMigrations(store);
  const skills = buildSkillsViewModel(repoRoot);
  const runs = buildRunsViewModel(store);
  const validation = validateProject(repoRoot, { checkSync: true, includePackageCheck: false });
  const issues = [];

  if (!migration.ok) {
    issues.push(issue("error", "local-state", "migration_required", "Local state needs migration.", "Run local migrate --apply."));
  }
  if (!validation.ok) {
    issues.push(...validation.issues);
  }

  return {
    schemaVersion: 1,
    ok: issues.length === 0,
    mode: "local-only",
    host: os.platform(),
    health: {
      validation: validation.ok ? "ok" : "failed",
      localState: migration.ok ? "ok" : "needs-migration",
      skills: skills.count,
      runs: runs.count,
    },
    nextActions: issues.length === 0 ? ["continue"] : issues.map((item) => item.recommendation).filter(Boolean),
    issues,
    warnings: [],
  };
}

function buildAlertsViewModel(status) {
  const alerts = [...(status.issues || []), ...(status.warnings || [])].map((item) => ({
    schemaVersion: 1,
    title: item.message,
    severity: item.severity || "warning",
    category: item.category || "general",
    code: item.code || "alert",
    recommendation: item.recommendation || null,
  }));
  return {
    schemaVersion: 1,
    count: alerts.length,
    alerts,
  };
}

function buildInsightsViewModel(repoRoot, options = {}) {
  const store = options.store || createLocalStore({ repoRoot, rootDir: options.stateDir || undefined });
  const runs = listRuns(store);
  const byStatus = runs.reduce((acc, run) => {
    acc[run.status] = (acc[run.status] || 0) + 1;
    return acc;
  }, {});
  const durations = runs.map((run) => run.durationMs).filter((value) => typeof value === "number");
  const averageDurationMs = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;
  return {
    schemaVersion: 1,
    runs: {
      total: runs.length,
      byStatus,
      averageDurationMs,
    },
    skills: {
      total: getSkills(repoRoot).length,
    },
  };
}

module.exports = {
  buildAlertsViewModel,
  buildInsightsViewModel,
  buildRunsViewModel,
  buildSkillsViewModel,
  buildStatusViewModel,
};
