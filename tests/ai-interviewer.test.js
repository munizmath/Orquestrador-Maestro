const { test } = require("node:test");
const assert = require("node:assert");
const { AiInterviewer } = require("../runtime/planner/ai-interviewer");

test("AiInterviewer should throw error and not swallow when provider execute fails", async () => {
  const mockProvider = {
    detect: async () => ({ installed: true }),
    execute: async () => {
      throw new Error("Simulated provider crash");
    }
  };

  const mockApp = {
    providers: {
      get: () => mockProvider
    },
    skills: {
      get: () => ({ instructions: "mock skill" })
    }
  };

  const interviewer = new AiInterviewer({
    resolvedSkills: [],
    preflightFacts: { workspacePath: "/tmp" },
    application: mockApp,
    intent: "test intent"
  });

  try {
    await interviewer.runInteractive();
    assert.fail("Should have thrown an error");
  } catch (e) {
    assert.strictEqual(e.message, "Simulated provider crash");
  }
});

test("AiInterviewer enforces read-only Codex execution during discovery and refinement", async () => {
  const calls = [];
  const provider = {
    id: "codex",
    detect: async () => ({ installed: true }),
    execute: async (request) => {
      calls.push(request);
      return { result: Promise.resolve({ stdout: "{}" }) };
    }
  };
  const interviewer = new AiInterviewer({
    resolvedSkills: [],
    preflightFacts: {},
    application: { providers: { get: () => provider } },
    intent: "Inspect project",
    aiProvider: "codex",
    sandbox: "read-only",
    workspacePath: "/tmp/maestro-read-only-project"
  });

  await interviewer._providerForExecution(provider).execute({ prompt: "discover", workspacePath: process.cwd() });
  await interviewer.refiner.provider.execute({ prompt: "refine", workspacePath: process.cwd() });
  assert.deepEqual(calls.map(({ sandbox, workspacePath }) => ({ sandbox, workspacePath })), [
    { sandbox: "read-only", workspacePath: "/tmp/maestro-read-only-project" },
    { sandbox: "read-only", workspacePath: "/tmp/maestro-read-only-project" }
  ]);
});

test("AiInterviewer rejects a non-Codex provider in read-only mode", () => {
  assert.throws(() => new AiInterviewer({
    resolvedSkills: [],
    preflightFacts: {},
    application: { providers: { get: () => ({ id: "opencode" }) } },
    intent: "Inspect project",
    aiProvider: "opencode",
    sandbox: "read-only",
    workspacePath: "/tmp/maestro-read-only-project"
  }), /READ_ONLY_PROVIDER_UNSUPPORTED/);
});
