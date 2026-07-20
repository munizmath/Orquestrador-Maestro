"use strict";

const path = require("node:path");
const { assertSchema } = require("../core/schemas.js");
const { hashText, redactText } = require("../core/security.js");

function workspaceKeyForPath(repoRoot) {
  return `workspace_${hashText(path.resolve(repoRoot)).slice(0, 12)}`;
}

function projectKeyForPath(repoRoot) {
  return `project_${hashText(path.resolve(repoRoot)).slice(0, 12)}`;
}

function buildTenantScope(repoRoot, input = {}) {
  const workspaceKey = input.workspaceKey || workspaceKeyForPath(repoRoot);
  const projectKey = input.projectKey || projectKeyForPath(repoRoot);
  return assertSchema("TenantScope", {
    schemaVersion: 1,
    workspaceKey,
    projectKey,
    projectRootRef: redactText(path.resolve(repoRoot)),
    mode: "local-only",
  });
}

function resolveTenantScope(repoRoot, queryEnvelope) {
  const expected = buildTenantScope(repoRoot);
  if (queryEnvelope.workspaceKey !== expected.workspaceKey || queryEnvelope.projectKey !== expected.projectKey) {
    return {
      ok: false,
      code: "tenant_scope_denied",
      safeSummary: "Query scope does not match the local project scope.",
      expected,
    };
  }
  return { ok: true, scope: expected };
}

module.exports = {
  buildTenantScope,
  projectKeyForPath,
  resolveTenantScope,
  workspaceKeyForPath,
};
