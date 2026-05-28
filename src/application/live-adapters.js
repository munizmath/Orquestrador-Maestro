"use strict";

const { listConnectors } = require("./connector-service.js");

function blockedAdapter(id, requiredConfig) {
  return {
    id,
    mode: "live-disabled",
    ok: false,
    execute() {
      return {
        ok: false,
        code: "live_adapter_disabled",
        message: "Live adapters are disabled by default. Use local config, dry-run, idempotency, and explicit confirmation before enabling.",
        requiredConfig,
      };
    },
  };
}

function listLiveAdapters() {
  const live = listConnectors().filter((connector) => connector.type.endsWith("-live"));
  return live.map((connector) => blockedAdapter(connector.id, [
    ...connector.requiredConfig,
    "--confirm-external",
  ]));
}

module.exports = {
  listLiveAdapters,
};
