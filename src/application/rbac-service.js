"use strict";

const crypto = require("node:crypto");
const { assertSchema } = require("../core/schemas.js");

const QUERY_ROLE_MATRIX = Object.freeze({
  "cockpit.overview.get": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "cockpit.summary.get": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "skills.routes.search": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "validation.status.get": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "runs.timeline.list": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "runs.record.get": ["maestro.owner", "maestro.operator", "service.panel"],
  "audit.events.list": ["maestro.owner"],
  "insights.snapshot.get": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "alerts.list": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "integrations.capabilities.list": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "connectors.list": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "queue.tasks.list": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "metrics.summary.get": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "llm.providers.list": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "adapters.live.list": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
  "actions.list": ["maestro.owner", "maestro.operator", "maestro.viewer", "service.panel"],
});

const ACTION_ROLE_MATRIX = Object.freeze({
  "validation.run": ["maestro.owner", "maestro.operator", "service.validator"],
});

function decisionKey(parts) {
  return `authz_${crypto.createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 20)}`;
}

function buildActorContext(input = {}) {
  return assertSchema("ActorContext", {
    schemaVersion: 1,
    actorKey: input.actorKey || "",
    roles: Array.isArray(input.roles) ? input.roles : [],
    sessionKey: input.sessionKey || null,
  });
}

function deny(queryEnvelope, reasonCode, safeSummary, requiredRoles = []) {
  return assertSchema("AuthorizationDecision", {
    schemaVersion: 1,
    decisionKey: decisionKey([queryEnvelope.queryName, queryEnvelope.actorKey, reasonCode]),
    effect: "deny",
    reasonCode,
    safeSummary,
    requiredRoles,
  });
}

function allow(queryEnvelope, safeSummary) {
  return assertSchema("AuthorizationDecision", {
    schemaVersion: 1,
    decisionKey: decisionKey([queryEnvelope.queryName, queryEnvelope.actorKey, "allow"]),
    effect: "allow",
    reasonCode: "allowed",
    safeSummary,
    requiredRoles: QUERY_ROLE_MATRIX[queryEnvelope.queryName] || [],
  });
}

function authorizeQuery(actorContext, queryEnvelope) {
  const actor = assertSchema("ActorContext", actorContext);
  const query = assertSchema("QueryEnvelope", queryEnvelope);
  const requiredRoles = QUERY_ROLE_MATRIX[query.queryName];

  if (!requiredRoles) {
    return deny(query, "query_not_registered", "Query is not registered for server-side authorization.");
  }

  if (actor.actorKey !== query.actorKey) {
    return deny(query, "actor_mismatch", "Actor context does not match query actor.");
  }

  const hasRole = actor.roles.some((role) => requiredRoles.includes(role));
  if (!hasRole) {
    return deny(query, "role_denied", "Actor role cannot read this resource.", requiredRoles);
  }

  return allow(query, "Query authorized server-side.");
}

function authorizeAction(actorContext, actionEnvelope) {
  const actor = assertSchema("ActorContext", actorContext);
  const action = assertSchema("ActionEnvelope", actionEnvelope);
  const requiredRoles = ACTION_ROLE_MATRIX[action.actionName];

  if (!requiredRoles) {
    return deny({
      queryName: action.actionName,
      actorKey: action.actorKey,
    }, "action_not_registered", "Action is not registered for server-side authorization.");
  }

  if (actor.actorKey !== action.actorKey) {
    return deny({
      queryName: action.actionName,
      actorKey: action.actorKey,
    }, "actor_mismatch", "Actor context does not match action actor.");
  }

  const hasRole = actor.roles.some((role) => requiredRoles.includes(role));
  if (!hasRole) {
    return deny({
      queryName: action.actionName,
      actorKey: action.actorKey,
    }, "role_denied", "Actor role cannot execute this action.", requiredRoles);
  }

  return allow({
    queryName: action.actionName,
    actorKey: action.actorKey,
  }, "Action authorized server-side.");
}

module.exports = {
  ACTION_ROLE_MATRIX,
  QUERY_ROLE_MATRIX,
  authorizeAction,
  authorizeQuery,
  buildActorContext,
};
