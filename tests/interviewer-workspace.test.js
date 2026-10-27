"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { BatchIntentDiscoverer } = require("../runtime/planner/batch-intent-discoverer");
const { IntentReconciler } = require("../runtime/planner/intent-reconciler");
const { IntentRefiner } = require("../runtime/planner/intent-refiner");
const { createIntentSpec } = require("../runtime/planner/intent-spec");

test("interview providers stay inside the selected project workspace", async () => {
  const workspacePath = "/tmp/maestro-selected-project";
  const calls = [];
  const responses = [
    { questions: [] },
    { objective: "Atualizar arquivo", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null },
    { updates: { objective: "Atualizar arquivo" }, addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null, recommendation: null }
  ];
  let stage = 0;
  const provider = {
    detect: async () => ({ installed: true }),
    execute: async (request) => {
      calls.push(request.workspacePath);
      const response = responses[stage];
      if (stage < responses.length - 1) stage += 1;
      return { result: Promise.resolve({ exitCode: 0, stdout: JSON.stringify(response) }) };
    }
  };

  await new BatchIntentDiscoverer({ provider, workspacePath }).discover("Atualizar arquivo", {}, [], {});
  await new IntentReconciler({ provider, workspacePath }).reconcile({ objective: "Atualizar arquivo", requirements: [], constraints: [], userDecisions: [], unknowns: [] }, [], {});
  await new IntentRefiner({ aiProvider: "fake", application: { providers: { get: () => provider } }, taskRelevantContext: {}, workspacePath })
    .refine(createIntentSpec("Atualizar arquivo", { status: "REFINING" }));

  assert.ok(calls.length >= 3);
  assert.ok(calls.every((path) => path === workspacePath));
});
