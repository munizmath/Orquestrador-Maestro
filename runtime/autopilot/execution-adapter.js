"use strict";

function createApplicationExecutionAdapter({ application, providerId = "opencode", model, agent, unit, cloudContextApproved = false } = {}) {
  if (!application || typeof application.executeTaskWithHandoff !== "function") {
    throw new TypeError("application with task execution is required");
  }
  if (typeof providerId !== "string" || providerId.trim() === "") throw new TypeError("providerId must be a non-empty string");

  return {
    id: `maestro:${providerId}`,
    async startTask({ task, workspacePath }) {
      if (providerId === "nexus") {
        if (!unit || typeof unit !== "object") {
          const error = new Error("NEXUS_EXECUTION_UNIT_REQUIRED: informe uma unidade PUE em --execution-unit");
          error.code = "NEXUS_EXECUTION_UNIT_REQUIRED";
          throw error;
        }
        return application.dispatchProviderUnit("nexus", {
          ...unit,
          workspacePath: unit.workspacePath || workspacePath,
          taskId: unit.taskId || task.task_id,
          cloudContextApproved
        });
      }
      return application.executeTaskWithHandoff({
        description: task.description,
        workspacePath,
        providerId,
        model,
        agent,
        cloudContextApproved,
        semanticTask: {
          paths: task.write_scope,
          capabilities: task.capabilities_required
        }
      });
    }
  };
}

module.exports = { createApplicationExecutionAdapter };
