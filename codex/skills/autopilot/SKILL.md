---
name: autopilot
description: Use when the user explicitly wants an autonomous, end-to-end software delivery workflow from an idea or brief to verified working code.
---

<Purpose>
Autopilot is the mission controller for one product objective. It turns a sufficiently clear brief into a verified delivery, classifies domains and capabilities, coordinates a temporary council when needed, distributes bounded execution lanes, recovers from blockers, and reports decisions in language the Maestro can act on.
</Purpose>

<Use_When>
- User wants end-to-end autonomous execution from an idea to working code
- User says "autopilot", "auto pilot", "autonomous", "build me", "create me", "make me", "full auto", "handle it all", or "I want a/an..."
- Task requires multiple phases: planning, coding, testing, and validation
- User wants hands-off execution and is willing to let the system run to completion
</Use_When>

<Do_Not_Use_When>
- User wants to explore options or brainstorm -- use the plan skill instead
- User says "just explain", "draft only", or "what would you suggest" -- respond conversationally
- User wants a single focused code change -- use ralph or delegate to an executor agent
- User wants to review or critique an existing plan -- use plan --review
- Task is a quick fix or small bug -- use direct executor delegation
</Do_Not_Use_When>

<Why_This_Exists>
Non-trivial software work needs coordinated requirements, design, implementation, recovery, verification, and product decisions. Autopilot owns the continuity of one mission so the Maestro can decide reserved trade-offs without manually directing every technical action.
</Why_This_Exists>

<Non_Negotiables>
- Autopilot owns one mission and is the single logical writer of its consolidated state.
- Use one authorized controller per project. Put independent work in lanes under that controller instead of starting competing Autopilots for the same project.
- The Maestro system may provide a global scheduler, capacity, leases, fencing, and fairness. The Maestro agent is consulted for decisions expressly reserved to its authority; it does not manually dispatch every slot.
- Autopilot invokes a council on its own when the trigger conditions in the mission contract are met. It must not wait for the user to force a technical retry.
- Escalate only when the executable alternative would exceed a current limit or require a decision expressly reserved to the Maestro authority.
- Boundaries are a projection of sovereign decisions. Autopilot may apply a valid authorization but cannot expand authority by editing its projection.
- Technical results and business dispositions are separate. An accepted risk never turns a failed check into a passed check.
- A claim of completion requires fresh evidence. A worker's self-report, a planned command, or code that merely looks right is not verification.
- Do not commit, push, merge, publish, deploy, delete, reset, or modify external systems unless the operation is covered by a current, applicable authorization issued by the user or by a validly delegated authority. Authorization at the wave, project, or execution level remains valid for the operations it covers; require a new decision only when the operation exceeds that scope or reaches an expressly reserved choice.
- Do not use a generic force path. Use explicit actions such as retry-council, choose-option, approve-cost, reduce-scope, accept-risk, or pause-run.
- If a required reviewer, council route, or adapter is unavailable, record the limitation and do not claim that unavailable work was performed.
</Non_Negotiables>

<Execution_Policy>
- The mission is a bounded state machine with orthogonal execution status, work phase, and blocker reason.
- The normal lifecycle is intake -> expansion -> planning -> execution -> QA -> validation -> handoff. Recovery is a work phase that can run while independent tasks remain active.
- A task blocker does not stop the mission when other useful, authorized tasks can continue.
- A mission enters waiting only when no executable next action exists within current authority and resources. Every wait needs a condition and an operational watcher or scheduled recheck.
- A known correction may be applied once when it is authorized and directly verifiable. A failed correction, uncertain cross-capability cause, incompatible specialist advice, or materially different technical alternatives trigger the council.
- Parallel execution requires current dependency satisfaction, authorized write scope, compatible changes, available resources, and an integration point. A parallel-safe flag alone is never sufficient.
- Use the smallest mode that can genuinely finish the mission. Do not increase council size or agent fan-out merely because more skills exist.
- Treat newer user task updates as local overrides for the active workflow branch while preserving earlier non-conflicting requirements.
- If correctness depends on additional inspection, retrieval, execution, or verification, keep using the relevant tools until the workflow is grounded.
- State tools are helpful but optional. The five filesystem artifacts and their revisions remain the source of truth when an optional runtime tool fails.
- Every non-trivial automatic decision records evidence, rejected alternatives, authority, and the cost or risk if wrong.
- Before changing code, define boundaries, forbidden operations, affected scopes, and the rollback or reconciliation point.
- Do not restart all validation after every change. Re-run the affected gate and declared dependents while retaining still-valid evidence.
- If the same diagnosis appears again, change the hypothesis, information, resource, or alternative; do not reset counters by renaming the blocker or restarting the process.
</Execution_Policy>

## Operating Modes

- quick: one compact plan, one implementation lane, one validation pass. Use for small, well-scoped work.
- standard: spec -> plan -> execute -> verify with focused artifacts and limited agents. Default mode.
- deep: multiple lanes, explicit boundaries, task graph, council review, recovery, and broader validation. Use only for large or risky work or explicit user request.

Autopilot chooses the smallest mode that can genuinely finish the task. The user can override with quick, standard, or deep.

## Mission Artifacts

For a project mission, use one fixed tree. Do not create one Autopilot subdirectory per task or per domain:

~~~text
.omx/autopilot/
├── checkpoint.md
├── boundaries.md
├── tasks.md
├── validation.md
└── survival-guide.md
~~~

- checkpoint.md: small current state, document revisions, active tasks, blocker IDs, council reference, controller lease, and next action.
- boundaries.md: objective, non-goals, authorized operations, reserved choices, decision references, cost and time limits, rollback, and completion definition.
- tasks.md: recoverable task and lane records with capability requirements, dependencies, owner, write scope, resource references, attempts, results, verification references, and blocker reference.
- validation.md: versioned technical gates, evidence, environment, technical result, business disposition, decision references, residual risk, and relevant rechecks.
- survival-guide.md: derived resumption summary with its source document revisions. It cannot create rules, revoke authorization, or reopen tasks.

Read references/mission-contracts.md before creating, resuming, or repairing a mission. It defines the artifact fields, controller write discipline, state transitions, council outputs, scheduler interaction, adapter events, leases, fencing, operation identity, and retention rules.

Keep the checkpoint short. The controller consolidates the other document revisions first and writes the checkpoint last. These files are not assumed to be one transaction; recovery reconciles revisions and effects before the next action with external impact.

## Phase Gates

Each phase gate must identify:

- the required artifact;
- the responsible owner;
- the next concrete action;
- the authority and risk boundary;
- the verification command or evidence target.

Phases are gates for progress, not a reason to paralyze independent lanes. The current phase may be recovery while other tasks continue.

<Steps>
0. **Pre-context Intake (required before Phase 0 starts)**:
   - Derive a task slug for the conversational context, but do not use it to create an Autopilot artifact subdirectory.
   - Load the latest relevant snapshot from .omx/context/{slug}-*.md when available.
   - If this is a resumed or compacted conversation, read checkpoint.md, its referenced document revisions, and the survival guide before opening new files.
   - If no snapshot exists, create .omx/context/{slug}-{timestamp}.md (UTC YYYYMMDDTHHMMSSZ) with task statement, desired outcome, known facts, constraints, unknowns, likely touchpoints, current phase, next action, and validation command.
   - Read applicable AGENTS.md files and compact DEV files in their required order.
   - Inspect status, branch, diff, project memory, and existing uncommitted work. Treat pre-existing changes as protected.
   - Confirm or acquire the single controller lease for the project. If the lease is unavailable, register a waiting condition and do not create a competing controller.
   - Initialize or reconcile the five files under .omx/autopilot/. Preserve recoverable prior runs and do not silently merge unrelated objectives.
   - Identify stack, package manager, available checks, entrypoints, deployment/data boundaries, and current decision references.
   - Keep the checkpoint short enough to read quickly. Its next action, owner, lease reference, risk boundary, and verification target must be explicit.
   - If ambiguity remains high, run explore first for brownfield facts, then route to deep-interview --quick before proceeding.

1. **Phase 0 - Expansion**: Turn the user's idea into a detailed spec.
   - Reuse an existing deep-interview spec when it applies.
   - Classify the objective into domains, capabilities, roles, and possible execution lanes. Do not treat every skill as a domain or invite every skill by default.
   - Invoke the council when the objective has a genuine cross-capability question or when a reserved product decision needs a bounded technical comparison.
   - Use the analyst and architect roles to define acceptance criteria, non-goals, assumptions, risks, authority boundaries, and evidence targets.
   - Output .omx/plans/autopilot-spec.md.
   - Gate: the spec identifies what is authorized, what is reserved, and how every criterion will be verified or explicitly human-validated.

2. **Phase 1 - Planning**: Create an implementation plan from the spec.
   - Build tasks and lanes with stable task_id and lane_id values.
   - For each task record capabilities_required, depends_on, owner, write_scope, resource_refs, status, attempt_id, result_refs, verification_refs, blocker_ref, and the current reason it is or is not runnable.
   - Resolve overlapping ownership, shared interfaces, migrations, configuration, lockfiles, generated files, and external resources as sequential or explicitly coordinated work.
   - Define resource_policy with min_agents, preferred_agents, max_agents, and allow_serial_fallback. These are request bounds; the scheduler resolves actual capacity.
   - Mark parallel-safe metadata only as a hint. Dispatch occurs only after current dependency, authority, lease, compatibility, and integration checks.
   - Output .omx/plans/autopilot-impl.md.
   - Gate: every task has an owner, dependency decision, write scope, acceptance evidence, and verification command or evidence target.

3. **Phase 2 - Execution**: Implement the plan through bounded lanes.
   - Request capacity from the Maestro scheduler. Do not manually allocate global slots and do not occupy a permanent model slot while waiting.
   - Use Nexus or OpenCode only through an available adapter contract. Treat adapter events as runtime facts; the controller converts them into task and mission transitions.
   - Assign isolated write scopes and resource leases. A controller, editor, and shared-resource lease are distinct.
   - Run only lanes whose current dependencies, authority, resources, write scope, and integration conditions are satisfied.
   - Keep the critical path moving while independent lanes work.
   - For each attempt, persist task_id, attempt_id, operation_id when external effects are possible, and the verification target.
   - The controller incorporates executor results and is the only logical writer of the five consolidated artifacts.
   - Before long edit or test loops, update the current artifact revisions and checkpoint next action.
   - If a task blocks, classify the blocker, continue useful independent work, and invoke the council automatically when its trigger conditions apply.
   - Set status to running with phase recovery while diagnosis or remediation is active. Set status to waiting only with a concrete return condition. Never report blocked without the blocker reason, attempted recovery, condition, and next re-evaluation.

4. **Phase 3 - QA**: Verify in layers and repair.
   - Start with existence and relevance checks, then focused behavior checks, integration/regression checks, and boundary checks for secrets, private paths, permissions, destructive operations, and generated output.
   - Apply a known authorized correction once, then verify it. If it fails or the cause is uncertain across capabilities, invoke the council.
   - Record technical_result independently from disposition. A decision can permit a limited delivery or defer work, but it cannot rewrite the technical result.
   - Re-run only affected gates and declared dependents after a change. Retain evidence whose artifact, environment, and assumptions remain applicable.
   - Repeat repair cycles within the configured cap. A new cycle must have a changed hypothesis, information, resource, or alternative.
   - Record root cause, changed hypothesis, smallest safe fix, covering check, result, residual risk, and any decision reference.

5. **Phase 4 - Validation**: Perform evidence-based independent review.
   - Give reviewers concise artifacts, the actual diff, relevant evidence, boundaries, and decision references.
   - Use functional, security, quality, and verification reviewers only when required by scope or risk. A single agent performing several skills is not independent review by several agents.
   - Findings include severity, path or symbol, evidence, required action, and disposition.
   - Rejected findings require a fix and scoped re-review. Do not convert unavailable review into approval.
   - The final validation record distinguishes technical result, accepted or deferred disposition, and the decision that authorized it.

6. **Phase 5 - Handoff and cleanup**:
   - Update validation.md, survival-guide.md, and checkpoint.md with final revisions, remaining risks, and exact next action.
   - Report what completed, what remains, what was accepted as a limitation, and what evidence supports each conclusion.
   - Clear only runtime state owned by this run:
     - state_clear({mode: "autopilot"})
     - state_clear({mode: "ralph"})
     - state_clear({mode: "ultrawork"})
     - state_clear({mode: "ultraqa"})
   - Do not delete the five mission artifacts, project evidence, or user changes as cleanup.
   - Do not mark the mission completed while a required technical gate remains blocking under the criteria and dispositions currently in force. A formal disposition may permit completion when the applicable decision expressly authorizes delivery with that limitation and all other criteria are satisfied. Preserve the original technical_result, record the disposition and decision_ref, and report the accepted limitation clearly.
</Steps>

## Automatic blocker recovery

Before declaring a mission waiting or failed:

1. identify the affected task and stable blocker ID;
2. classify the blocker reason;
3. apply one known correction when it is authorized and directly verifiable;
4. invoke the council automatically when a correction failed, the cause crosses capabilities, specialist advice conflicts, or alternatives need comparison;
5. execute a returned remediation plan when it is within boundaries;
6. verify the affected gate and its dependents;
7. continue independent lanes;
8. escalate only when the next executable alternative exceeds a current limit or requires a reserved decision.

Council outputs are RESOLVED, REMEDIATION_PLAN, WAITING_CONDITION, NEEDS_DECISION, or UNRESOLVED. A remediation plan must name the proposed change, affected tasks, executor, verification, and residual risk. An unresolved council keeps its diagnosis and attempts; changing the agent or renaming the blocker does not reset limits.

When the Maestro authority must act, send a decision packet in plain language:

1. what happened;
2. what is actually stopped;
3. what was attempted;
4. what continues;
5. how the mission will resume;
6. the exact choice or action required;
7. the impact and residual risk of each option.

Estimates remain estimates. Do not invent cost, schedule, success, or availability.

## Tool and adapter integration

Use the runtime adapter for actual execution, capacity, status, cancellation, and result events. Do not treat a skill name, route count, or session existence as proof that an agent is available or that work completed.

The adapter must maintain the internal contract's project, run, task, attempt, session, event, lease, lease epoch, result, and evidence identities and links. It correlates commands with native sessions or executions when the runtime exposes them. Native fields beyond the internal contract are optional and their absence must be represented explicitly. A result that cannot be correlated safely remains unknown until reconciliation. A requested cancellation is not a confirmed cancellation. A lost connection is an unknown outcome that requires reconciliation before repeating an effectful operation.

Use the scheduler for cross-project fairness and resource availability. Use the Autopilot controller for mission continuity, council invocation, task transitions, artifact consolidation, and user communication.

## State management

Use omx_state lifecycle tools when available, but keep the filesystem artifacts authoritative:

- on start, record active mission, run_id, status, phase, snapshot reference, and controller lease;
- on phase changes, record the current phase without erasing task-level blockers;
- on waiting, record the return condition, watcher or recheck, and affected task;
- on completion, record final evidence and disposition before clearing runtime state;
- on resume, verify lease, document revisions, operation outcomes, and evidence validity.

If omx_state fails, continue with the five artifacts and record the limitation. Never claim that a runtime state operation succeeded when it was unavailable.

## Token And Compaction Discipline

- Load router/index files before full catalogs or long references.
- Prefer file paths, symbols, revisions, and focused snippets over full file dumps.
- Summarize long output into validation.md or the checkpoint instead of replaying it.
- Do not spawn agents to repeat the same search as the controller.
- Treat compaction as a resume event. Reconcile the latest checkpoint and document revisions before continuing.
- Keep survival-guide.md current enough for a new session to continue without raw conversation history.

## Scenario Examples

Good: user asks Autopilot to build a REST API with a clear domain, features, and technology constraint. Autopilot creates a mission, classifies capabilities, plans lanes, verifies dependencies, and executes.

Good: an API authorization test fails while documentation and independent frontend work can continue. Autopilot records the blocker, keeps useful work running, invokes the relevant council, and enters recovery without freezing the mission.

Good: a provider credential is unavailable. Autopilot records a waiting condition and recheck mechanism, explains the user's exact action in plain language, and continues authorized independent lanes.

Bad: a generic force command bypasses a missing authorization or expands a cost limit.

Bad: two Autopilots write the same project-level task ledger because a controller lease expired without fencing.

Bad: a business decision marks a failed security gate as passed.

<Escalation_And_Stop_Conditions>
- Suspend the affected task and its dependents, preserve the diagnosis and attempts, and continue independent authorized lanes when the same diagnosis persists after its bounded remediation cycles and no changed hypothesis, information, resource, or alternative is available. Only pause the whole mission when no useful independent work remains.
- When a task needs a decision reserved to the Maestro authority and no valid decision exists, record the pending decision and continue other eligible tasks. Put the mission into the appropriate waiting, paused, or failed state only when no next action remains for the mission.
- When a task needs a resource with no watcher or recheck condition, do not present it as automatically resumable waiting. Record the missing return mechanism, continue independent work, and pause the mission if no other executable work remains; state the condition that would permit resumption.
- Stop the mission when the user says stop, cancel, or abort; if the instruction targets a task or lane, stop only that scope and preserve unaffected work.
- Pause before deploy, publish, push, merge, delete, reset, production-data changes, account/auth changes, paid services, or third-party communication unless the operation is covered by a current, applicable authorization issued by the user or a validly delegated authority.
- If a dependency, credential, service, or platform is unavailable, try a local substitute or static verification and report the limitation; never invent success.
</Escalation_And_Stop_Conditions>

<Final_Checklist>
- [ ] Mission envelope, authority references, and controller lease are recorded
- [ ] The five fixed artifacts are current and their revisions reconcile
- [ ] Tasks have stable identities, owners, dependencies, write scopes, attempts, and verification targets
- [ ] Parallel lanes passed current dependency, authority, lease, compatibility, and resource checks
- [ ] Blockers have reasons, recovery attempts, return conditions, and council references where applicable
- [ ] Technical results are separate from business dispositions
- [ ] Required gates and reviews have fresh evidence, or limitations are explicit
- [ ] External effects have operation identity and reconciled outcomes
- [ ] Residual findings and decisions are visible in the handoff
- [ ] No unauthorized commit, push, merge, publish, deploy, deletion, or external side effect occurred
- [ ] Runtime state cleanup preserves mission artifacts and user changes
</Final_Checklist>

<Advanced>
## Configuration

Optional settings may define QA and validation caps, but they cannot override project authority, the controller lease, fencing, or cost policy.

~~~toml
[omx.autopilot]
maxIterations = 10
maxQaCycles = 5
maxValidationRounds = 3
pauseAfterExpansion = false
pauseAfterPlanning = false
skipQa = false
skipValidation = false
~~~

## Resume

If Autopilot was cancelled or failed, run /autopilot again. Resume from the five fixed artifacts after reconciling the controller lease, document revisions, interrupted effects, and still-valid evidence.

## Recommended Clarity Pipeline

For ambiguous requests, prefer:

~~~text
deep-interview -> ralplan -> autopilot
~~~

- deep-interview: ambiguity-gated requirements
- ralplan: consensus planning
- autopilot: execution, council recovery, QA, validation, and handoff

## Pipeline Orchestrator

Autopilot may use a configurable pipeline orchestrator when available. Treat its stages as adapters of the mission controller, not as a second source of truth. Pipeline state must correlate to run, task, attempt, lease, result, and evidence references and must resume through the same reconciliation rules.

## Troubleshooting

If a mission appears stuck, inspect checkpoint.md, the active task records, blocker condition, controller lease, scheduler capacity, and the last adapter events. Do not solve a controller or lease problem by creating a second Autopilot for the same project.
</Advanced>
