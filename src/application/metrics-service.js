"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { listRuns } = require("./run-registry.js");
const { readAuditEvents } = require("./audit-log.js");

function buildMetrics(store) {
  const runs = listRuns(store);
  const events = readAuditEvents(store);
  const byRunStatus = runs.reduce((acc, run) => {
    acc[run.status] = (acc[run.status] || 0) + 1;
    return acc;
  }, {});
  const byEventType = events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1;
    return acc;
  }, {});
  return {
    schemaVersion: 1,
    runs: {
      total: runs.length,
      byStatus: byRunStatus,
    },
    audit: {
      total: events.length,
      byType: byEventType,
    },
  };
}

function retentionPlan(store, olderThanDays = 30) {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const candidates = listRuns(store).filter((run) => Date.parse(run.startedAt) < cutoff);
  return {
    schemaVersion: 1,
    olderThanDays,
    candidates: candidates.map((run) => ({ id: run.id, startedAt: run.startedAt, status: run.status })),
  };
}

function purgeRuns(store, olderThanDays = 30, options = {}) {
  const plan = retentionPlan(store, olderThanDays);
  if (options.dryRun !== false) {
    return { ...plan, dryRun: true, purged: 0 };
  }
  let purged = 0;
  for (const candidate of plan.candidates) {
    const file = store.path("runs", `${candidate.id}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      purged += 1;
    }
  }
  return { ...plan, dryRun: false, purged };
}

module.exports = {
  buildMetrics,
  purgeRuns,
  retentionPlan,
};
