"use strict";

const { createLocalStore } = require("./local-store.js");

const CURRENT_SCHEMA_VERSION = 1;

function planMigrations(store = createLocalStore()) {
  const manifest = store.readJson("manifest.json", null);
  if (!manifest) {
    return {
      ok: true,
      currentVersion: 0,
      targetVersion: CURRENT_SCHEMA_VERSION,
      actions: [
        {
          type: "create-manifest",
          path: "manifest.json",
          schemaVersion: CURRENT_SCHEMA_VERSION,
        },
      ],
    };
  }

  if (manifest.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      currentVersion: manifest.schemaVersion || null,
      targetVersion: CURRENT_SCHEMA_VERSION,
      actions: [],
      issues: [`Versao de schema local nao suportada: ${manifest.schemaVersion || "ausente"}`],
    };
  }

  return {
    ok: true,
    currentVersion: manifest.schemaVersion,
    targetVersion: CURRENT_SCHEMA_VERSION,
    actions: [],
  };
}

function applyMigrations(store = createLocalStore()) {
  store.ensure();
  const plan = planMigrations(store);
  if (!plan.ok) return plan;
  for (const action of plan.actions) {
    if (action.type === "create-manifest") {
      store.writeJson(action.path, {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        stores: ["audit", "runs", "queue"],
      });
    }
  }
  return { ...plan, applied: plan.actions.length };
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  planMigrations,
  applyMigrations,
};
