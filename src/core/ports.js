"use strict";

function createPortContract(name, methods) {
  if (!name || typeof name !== "string") {
    throw new Error("Port contract requires a name.");
  }
  if (!Array.isArray(methods) || methods.length === 0) {
    throw new Error(`Port ${name} requires at least one method.`);
  }
  return Object.freeze({
    name,
    methods: Object.freeze([...methods]),
  });
}

function assertPort(contract, implementation) {
  if (!implementation || typeof implementation !== "object") {
    throw new Error(`Port ${contract.name} requires an implementation object.`);
  }
  const missing = contract.methods.filter((method) => typeof implementation[method] !== "function");
  if (missing.length > 0) {
    throw new Error(`Port ${contract.name} missing method(s): ${missing.join(", ")}`);
  }
  return implementation;
}

const RunStore = createPortContract("RunStore", ["create", "update", "get", "list"]);
const EventStore = createPortContract("EventStore", ["append", "list"]);
const TaskQueueStore = createPortContract("TaskQueueStore", ["enqueue", "lease", "complete", "fail", "cancel", "list"]);
const PolicyEngine = createPortContract("PolicyEngine", ["evaluate"]);
const AuditSink = createPortContract("AuditSink", ["write"]);
const ConnectorRegistry = createPortContract("ConnectorRegistry", ["list", "get", "check"]);
const ProviderRegistry = createPortContract("ProviderRegistry", ["list", "get", "check"]);

module.exports = {
  createPortContract,
  assertPort,
  ports: Object.freeze({
    RunStore,
    EventStore,
    TaskQueueStore,
    PolicyEngine,
    AuditSink,
    ConnectorRegistry,
    ProviderRegistry,
  }),
};
