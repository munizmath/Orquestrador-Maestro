"use strict";

function listActions() {
  return [
    {
      schemaVersion: 1,
      id: "adapter.check",
      label: "Check adapter",
      riskLevel: "low",
      dryRun: false,
      requiresConfirmation: false,
      auditEvent: "action.adapter_check",
      rollbackHint: "No state change.",
    },
    {
      schemaVersion: 1,
      id: "adapter.dryRun",
      label: "Generate adapter dry-run",
      riskLevel: "low",
      dryRun: true,
      requiresConfirmation: false,
      auditEvent: "action.adapter_dry_run",
      rollbackHint: "No external call is made.",
    },
    {
      schemaVersion: 1,
      id: "adapter.execute",
      label: "Execute adapter",
      riskLevel: "high",
      dryRun: false,
      requiresConfirmation: true,
      auditEvent: "action.adapter_execute",
      rollbackHint: "External side effects may not be reversible.",
      disabledInPanel: true,
    },
  ];
}

module.exports = {
  listActions,
};
