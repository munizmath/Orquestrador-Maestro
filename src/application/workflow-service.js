"use strict";

const { dryRunConnector } = require("./connector-service.js");

const LOCAL_WORKFLOWS = Object.freeze([
  { id: "wf_local_onboarding", name: "Local onboarding", status: "active" },
  { id: "wf_local_followup", name: "Local follow-up", status: "draft" },
]);

function listWorkflows() {
  return LOCAL_WORKFLOWS.map((workflow) => ({ ...workflow }));
}

function dryRunWorkflowTrigger(workflowId, payload = {}) {
  const workflow = LOCAL_WORKFLOWS.find((item) => item.id === workflowId);
  if (!workflow) return { ok: false, code: "workflow_not_found" };
  const result = dryRunConnector("local-n8n-dry-run", {
    action: "workflow.trigger",
    payload: {
      workflowId,
      payload,
    },
  }, { confirmed: true });
  return {
    ok: result.ok,
    workflow,
    preview: result,
  };
}

module.exports = {
  dryRunWorkflowTrigger,
  listWorkflows,
};
