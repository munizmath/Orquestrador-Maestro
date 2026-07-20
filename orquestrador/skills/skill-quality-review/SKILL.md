---
name: skill-quality-review
description: Review new or changed Orquestrador skills for actionable scope, compact structure, progressive disclosure, risk guardrails, verification, routing metadata, catalog coverage, and safe local/public boundaries before they enter the canonical registry.
category: governance
risk: medium
source: local-skill-quality-patterns
---

# Skill Quality Review

Use this skill before adding, updating, or promoting a skill into the canonical Orquestrador registry.

## Core Workflow

1. Read the proposed `SKILL.md`, manifest entry, router entry, aliases, chains, and catalog row.
2. Confirm the skill has a clear trigger, bounded scope, and actionable description.
3. Check the body for compact sections: workflow, guardrails or contract, verification, and related skills.
4. Ensure risk level matches the operational blast radius and that medium/high risk skills include explicit guardrails.
5. Confirm long references, examples, and templates live in `references/`, `scripts/`, or docs instead of bloating `SKILL.md`.
6. Verify the skill is mirrored to Codex when `mirrorEverywhere` is true.
7. Run the catalog validator and report concrete fixes before approval.

## Guardrails

- Do not approve generic skills that only restate broad advice.
- Do not approve skills without a verification section.
- Do not approve medium/high risk skills without guardrails, gates, hard stops, or a clear contract.
- Do not copy external catalogs wholesale; absorb patterns into concise local guidance.
- Do not include secrets, concrete private paths, logs, personal data, or runtime cache content.
- Do not add aliases that are so broad they will hijack unrelated tasks.

## Review Checklist

- Frontmatter includes `name`, `description`, `category`, `risk`, and `source`.
- Manifest includes `priorityScore`, `mirrorEverywhere`, triggers, aliases, and `status`.
- Router includes triggers, canonical path, Codex path, cost, and safety.
- Chains include reasons for every `mayInvoke` target when chaining is needed.
- Catalog docs include the skill row.
- Codex mirror matches canonical content when required.

## Verification

- Run `node scripts/skill-catalog.js validate --check-sync`.
- Run `npm run validate -- --check-sync` before claiming the registry is healthy.
- For routing changes, run or update `tests/routing-cases.json`.

## Related Skills

- `skill-multiagent-orchestration`
- `skill-ai-orchestration`
- `skill-github-mcp-automation`
