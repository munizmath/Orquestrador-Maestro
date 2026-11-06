# Autopilot Mission Contracts

This reference is normative for the Autopilot mission state, artifacts, council, concurrency, recovery, and adapter integration. It complements SKILL.md; it does not grant authority that is absent from project instructions or the decision registry.

## Responsibility boundaries

The Maestro system owns the global scheduler, resource capacity, leases, fencing, and fairness across projects. The Maestro authority makes product decisions that are expressly reserved to it. Autopilot owns the continuity of one mission and coordinates temporary council consultations. Skills and agents execute bounded lanes. Nexus and OpenCode adapters report runtime facts and do not become the source of mission truth.

There is one authorized mission controller per project. Multiple independent lanes may run under that controller. Unrelated objectives are queued or isolated; they are not silently merged into the same mission.

## Mission envelope

The controller keeps the current mission identity in checkpoint.md:

~~~yaml
schema_version: 2
project_id: project-example
run_id: RUN-014
revision: 18

status: running
phase: recovery

document_revisions:
  boundaries: 4
  tasks: 12
  validation: 19

active_task_ids:
  - TASK-03
blocker_ids:
  - BLOCK-02

council_ref: COUNCIL-03
controller_lease_ref: LEASE-42

next_action:
  type: execute_remediation
  task_id: TASK-07
~~~

The checkpoint remains small. It points to detailed records instead of reproducing the whole plan, diagnosis, or evidence. status describes execution activity; phase describes the current work lens. status: running with phase: recovery is valid while remediation runs and independent tasks continue.

## Fixed artifact tree

Normal execution uses one project-level tree:

~~~text
.omx/autopilot/
├── checkpoint.md
├── boundaries.md
├── tasks.md
├── validation.md
└── survival-guide.md
~~~

The controller is the only logical writer of the consolidated mission state. Executors return identified results; they do not rewrite the global plan. Updates are versioned. The controller writes the checkpoint after incorporating the other document revisions. These five files are not assumed to be one transaction: a restart must reconcile revisions and results before taking the next effectful action.

### boundaries.md

This file is a projection of authority, not the sovereign decision source. It must answer:

- What result was authorized?
- Which operations may Autopilot perform?
- Which choices are reserved?
- Which cost and time limits are active?
- Which prior decisions cover this mission?
- What defines a completed delivery?

Every projected authorization identifies its source and revision:

~~~yaml
authorization_ref: DECISION-008
authorization_revision: 2
source_ref: product-decision-2026-11-05
scope: use-existing-provider
valid_for: RUN-014
expires_at: null
~~~

Autopilot may apply a valid decision but cannot expand its authority by editing this projection. A new authorization, revocation, or replacement creates a new version in the sovereign decision registry and identifies affected tasks.

### Sovereign decision record

The decision registry, or the existing Maestro contract that governs it, is the authoritative source for authorization. Each decision records its identity and revision, the authority and source that issued it, the approved effect, the projects, waves, runs, resources, and operations in scope, the authorized operations and limits, its status and validity interval, and any decision it revokes or supersedes. A valid authorization at wave level remains applicable to the covered tasks and executions; creating a new session, attempt, or run does not by itself require another approval. A new decision is required when an operation exceeds the current scope or reaches an expressly reserved choice.

### tasks.md

Each task is recoverable and verifiable. At minimum, record:

| Field | Meaning |
| --- | --- |
| task_id, lane_id | Stable work identity |
| capabilities_required | Skills or capabilities needed |
| depends_on | Preconditions |
| owner | Current executor or role |
| write_scope | Files or modules owned by the lane |
| resource_refs | Shared resources needed |
| status | Task state |
| attempt_id | Current execution attempt |
| result_refs | Produced outputs |
| verification_refs | Completion evidence |
| blocker_ref | Waiting or impediment record |

parallel_safe is advisory metadata, not authorization to run concurrently. A lane is runnable only when dependencies, authority, resource leases, write-scope compatibility, and integration conditions are satisfied. Different files can still conflict through a changing API, schema, configuration, generated output, or shared resource.

### validation.md

Technical evidence and business disposition remain separate:

~~~yaml
gate_id: AUTH-01
task_id: TASK-03
artifact_ref: commit-or-snapshot-18
environment_ref: staging-03
technical_result: fail
evidence_ref: EVIDENCE-021
disposition: accepted_risk
decision_ref: DECISION-008
~~~

technical_result states what the verification actually found. disposition states what the authorized decision does with that result, for example blocks_release, accepted_risk, deferred, or waived. A decision never turns a failed test into a passed test.

Evidence remains applicable only while the evaluated artifact, environment, and relevant assumptions remain unchanged. When a change affects a gate, rerun that gate or its declared dependents; do not restart all validation by default.

### survival-guide.md

This is a derived resumption summary:

- completed work;
- active work;
- waiting conditions;
- still-valid decisions;
- next action;
- document revisions used to generate the summary.

It cannot create rules, revoke authorization, or reopen tasks merely because it contains an old description. The checkpoint, task records, validation records, and sovereign decisions remain authoritative.

## Execution state

Keep three dimensions separate:

| Dimension | Examples |
| --- | --- |
| Execution status | queued, running, waiting, paused, completed, failed, cancelled |
| Work phase | intake, expansion, planning, execution, recovery, qa, validation, handoff |
| Blocker reason | technical_failure, resource_unavailable, external_dependency, authorization_insufficient, decision_required |

An impediment belongs first to the affected task. Independent useful work may continue. The mission enters waiting only when no executable next action exists within current authority and resources.

Every wait has:

~~~yaml
waiting_for:
  type: external_dependency
  condition: homologation_credential_available
  watch_ref: provider-config
  recheck_at: 2026-11-05T18:00:00-03:00
~~~

The condition and either an operational watcher or a scheduled recheck are required. A watcher or timer only triggers evaluation; resumption occurs after the condition is confirmed.

technical_failure starts recovery. failed means the mission ended without the intended result and must state what was delivered and what remained incomplete. A retry, process restart, or renamed blocker does not reset attempt counters.

## Escalation and council

Escalate only when the executable alternative would exceed a current limit or require a decision expressly reserved to the Maestro authority.

Before escalating, record one of:

1. authorized alternatives were examined, with the relevant evidence and why they did not resolve the issue; or
2. the blocker prevents examining them, with the missing information, access, or resource identified.

Impact on cost, schedule, product experience, and risk informs comparison. Impact alone does not trigger escalation.

Autopilot invokes the council automatically when:

- a known correction failed;
- the cause is uncertain across capabilities;
- specialists produce incompatible solutions;
- alternatives have materially different technical consequences;
- a resource is missing but a plausible alternative may exist;
- a decision requires a bounded technical comparison.

If no route can execute the council, the request remains pending with a capacity wait condition. Autopilot must not claim that no solution exists merely because the council route is temporarily unavailable.

The council is selected by the question and required capabilities. Distinguish:

- skill: knowledge or procedure;
- role: specialist, reviewer, verifier, or integrator function;
- agent: execution instance;
- lane: bounded work front.

One agent applying several skills is not independent review by several agents. When capacity is low, analyses may run sequentially, and the record must say so. An independent-review requirement remains active when it is part of the authorized gate.

Council outputs:

| Output | Meaning | Autopilot action |
| --- | --- | --- |
| RESOLVED | Cause removed and relevant verification passed | Resume |
| REMEDIATION_PLAN | Concrete solution within authority | Create or update tasks and execute |
| WAITING_CONDITION | Identified dependency with return condition | Register the wait |
| NEEDS_DECISION | Choice exceeds delegated authority | Prepare decision packet |
| UNRESOLVED | Examined alternatives did not resolve the issue | Continue permitted work or end explicitly |

REMEDIATION_PLAN must identify the proposed change, affected tasks, executor, verification, and residual risk. A generic “review the architecture” is not a remediation plan.

Use bounded cycles. The default policy is one known correction before council, one active council per stable blocker, and at most two materially different remediation alternatives per diagnostic cycle. A new cycle requires a changed hypothesis, information, resource, or alternative, and all counters persist across sessions.

Do not use a generic force path. Use explicit actions such as retry-council, choose-option, approve-cost, reduce-scope, accept-risk, or pause-run.

## Scheduler and concurrency

The scheduler is a Maestro system component; Autopilot requests capacity and does not manually assign global slots. One controller lease governs a project. Lanes may run concurrently under that controller.

Capacity is real resource capacity, not the number of healthy routes. Shared account, quota, GPU, workspace, model, and provider constraints must be considered.

~~~yaml
resource_policy:
  min_agents: 1
  preferred_agents: 4
  max_agents: 8
  allow_serial_fallback: true
~~~

These values are resolved per request. Actual allocation is bounded by ready compatible lanes, route and resource health, project limits, global availability, and cost policy. min_agents is an admission or parallelism requirement; it is not a promise to create agents when capacity is unavailable.

The scheduler should:

1. consider only authorized tasks with satisfied dependencies;
2. give eligible projects fair opportunity before expanding one project heavily;
3. distribute excess capacity by priority and wait time;
4. re-evaluate when work finishes, capacity changes, or a lane becomes ready;
5. preserve an in-progress edit during routine redistribution.

At minimum distinguish leases for:

- control of the project state;
- editing a file or module scope;
- operating a shared resource.

Each lease carries an epoch or fencing token. For each protected resource, Maestro issues a strictly increasing, non-reusable fencing token on every new acquisition, and the sequence persists across restarts. Renewing the current lease preserves its identity; a new acquisition receives a new epoch. The protected destination validates that grant and epoch at the point that applies the effect and rejects an expired, revoked, or older epoch. A token recorded only in checkpoint.md is insufficient. Lease expiry also does not prove that an old process stopped; reassigning the scope requires confirmed interruption or enforced fencing.

## Adapter events

Adapters map Nexus or OpenCode runtime facts to a common internal envelope:

~~~yaml
schema_version: 1
event_id: EVENT-00127
source: opencode-adapter
event_type: execution.completed
project_id: project-example
run_id: RUN-014
task_id: TASK-07
attempt_id: ATTEMPT-03
session_id: SESSION-091
sequence: 9
occurred_at: 2026-11-05T18:00:00-03:00
lease_ref: LEASE-042
lease_epoch: 43
result_ref: RESULT-018
evidence_refs: []
~~~

Essential events are execution.accepted, execution.started, execution.progress, execution.completed, execution.failed, execution.cancelled, and resource.changed.

The controller must deduplicate by source and event identity, correlate results to task and attempt, use scoped sequence numbers instead of timestamps for ordering, reject stale events from regressing current state, and distinguish cancellation requested from cancellation confirmed. A lost connection produces unknown outcome and reconciliation before repeating an effectful operation.

execution.completed makes a result available; it does not automatically complete the task or resolve a blocker. The controller incorporates the result and runs the applicable verification.

## Persistence and external effects

Each attempt that can affect an external target carries an operation identity:

~~~yaml
task_id: TASK-07
attempt_id: ATTEMPT-03
operation_id: OPERATION-018
status: interrupted
result_ref: null
~~~

On resume, the controller confirms the run and controller lease, loads the referenced document revisions, reconciles interrupted tasks with actual results, reuses still-valid evidence, and takes the next safe action. An unknown outcome is not treated as an unexecuted operation; the target is inspected before retrying.

History compaction may shorten logs but must preserve stable identities, results, decisions, evidence references, and the source revision needed to interpret the current state. Open-run records, decisions supporting active authorization, and evidence supporting a still-valid conclusion remain recoverable. Expiry follows an existing explicit retention policy; this contract does not invent a deletion deadline.

## User communication

When the Maestro authority must act, Autopilot reports:

1. what happened;
2. what is actually stopped;
3. what was attempted;
4. what continues;
5. how the run will resume;
6. the exact decision or action required.

Estimates remain estimates. The message must not invent cost, schedule, or success to fill a field.
