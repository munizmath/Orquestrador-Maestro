"use strict";

const ADAPTER_MODES = Object.freeze({
  MOCK: "mock",
  DRY_RUN: "dry-run",
  LIVE_DISABLED: "live-disabled",
  LIVE_READY: "live-ready",
  BLOCKED: "blocked",
});

function createAdapterDescriptor(input) {
  if (!input || typeof input !== "object") throw new Error("Adapter descriptor requires an object.");
  for (const field of ["id", "type", "mode"]) {
    if (!input[field] || typeof input[field] !== "string") throw new Error(`Adapter descriptor missing ${field}.`);
  }
  if (!Object.values(ADAPTER_MODES).includes(input.mode)) throw new Error(`Invalid adapter mode: ${input.mode}`);
  if (!Array.isArray(input.capabilities) || input.capabilities.length === 0) {
    throw new Error(`Adapter ${input.id} requires capabilities.`);
  }
  return Object.freeze({
    schemaVersion: 1,
    id: input.id,
    type: input.type,
    mode: input.mode,
    capabilities: Object.freeze([...input.capabilities]),
    permissions: Object.freeze({
      read: false,
      write: false,
      network: false,
      webhook: false,
      filesystem: false,
      externalSend: false,
      ...(input.permissions || {}),
    }),
    requiredConfig: Object.freeze([...(input.requiredConfig || [])]),
  });
}

function createAdapter(descriptor, lifecycle) {
  const required = ["configure", "check", "plan", "dryRun", "execute"];
  for (const method of required) {
    if (!lifecycle || typeof lifecycle[method] !== "function") {
      throw new Error(`Adapter ${descriptor.id} missing lifecycle method: ${method}`);
    }
  }
  return Object.freeze({ descriptor, lifecycle: Object.freeze({ ...lifecycle }) });
}

function createRegistry(adapters) {
  const map = new Map();
  for (const adapter of adapters) {
    if (map.has(adapter.descriptor.id)) throw new Error(`Duplicate adapter id: ${adapter.descriptor.id}`);
    map.set(adapter.descriptor.id, adapter);
  }
  return Object.freeze({
    list() {
      return Array.from(map.values()).map((adapter) => adapter.descriptor);
    },
    get(id) {
      return map.get(id) || null;
    },
    check(id, context = {}) {
      const adapter = map.get(id);
      if (!adapter) return { ok: false, id, code: "adapter_not_found" };
      return adapter.lifecycle.check(context);
    },
    plan(id, intent, context = {}) {
      const adapter = map.get(id);
      if (!adapter) return { ok: false, id, code: "adapter_not_found" };
      return adapter.lifecycle.plan(intent, context);
    },
    dryRun(id, intent, context = {}) {
      const adapter = map.get(id);
      if (!adapter) return { ok: false, id, code: "adapter_not_found" };
      return adapter.lifecycle.dryRun(intent, context);
    },
    execute(id, intent, context = {}) {
      const adapter = map.get(id);
      if (!adapter) return { ok: false, id, code: "adapter_not_found" };
      return adapter.lifecycle.execute(intent, context);
    },
  });
}

module.exports = {
  ADAPTER_MODES,
  createAdapter,
  createAdapterDescriptor,
  createRegistry,
};
