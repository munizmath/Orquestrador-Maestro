"use strict";

const { dryRunConnector } = require("./connector-service.js");

const MOCK_WORKFLOWS = Object.freeze([
  { id: "wf_mock_onboarding", name: "Mock onboarding", status: "active" },
  { id: "wf_mock_followup", name: "Mock follow-up", status: "draft" },
]);

function listWorkflows() {
  return MOCK_WORKFLOWS.map((workflow) => ({ ...workflow }));
}

function dryRunWorkflowTrigger(workflowId, payload = {}) {
  const workflow = MOCK_WORKFLOWS.find((item) => item.id === workflowId);
  if (!workflow) return { ok: false, code: "workflow_not_found" };
  const result = dryRunConnector("mock-n8n", {
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
