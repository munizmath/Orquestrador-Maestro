---
name: skill-github-mcp-automation
description: Use for GitHub MCP automation around repositories, issues, pull requests, Actions, releases, code search, security findings, and repository maintenance with explicit permission gates.
category: integrations
risk: medium
source: github-mcp-server-patterns
---

# GitHub MCP Automation

Use this skill when a task asks an agent to work with GitHub through MCP tools, GitHub Apps, or repository APIs. Prefer read-only inspection first, then make the smallest explicit mutation needed.

## Core Workflow

1. Identify repository, branch, issue, pull request, workflow run, or release target.
2. Confirm the requested operation class: read, comment, label, assign, edit file, create branch, open PR, rerun CI, merge, release, or publish.
3. Use read-only tools first: repository metadata, file fetch, code search, issue/PR metadata, changed files, checks, Actions runs, and comments.
4. Before writes, state the intended mutation and ensure it is authorized by the user and project governance.
5. Keep branch naming, PR descriptions, labels, changelog format, and review style consistent with the repository.
6. Do not expose tokens, installation IDs, private URLs, raw logs with PII, or secret-like values in comments, PR bodies, artifacts, or generated docs.
7. For CI and Actions, inspect failed job names and relevant logs before rerunning. Prefer rerunning failed jobs over full workflow reruns.
8. For PR review, prioritize behavioral bugs, regressions, security risks, missing tests, and release blockers.
9. For maintenance automation, make idempotent updates: repeated runs should not duplicate labels, comments, issues, changelog entries, or workflow dispatches.
10. Verify the final repository state through GitHub metadata or local git status before claiming completion.

## Permission Gates

Never do these without explicit user authorization:

- push a branch;
- merge or close a PR;
- rebase, force-push, or rewrite history;
- publish a release or package;
- delete branches, tags, files, issues, comments, artifacts, or workflow runs;
- change repository visibility, secrets, branch protection, environments, teams, permissions, or webhooks.

## Toolset Guidance

- Repositories: inspect metadata, default branch, files, refs, commits, and compare ranges before editing.
- Issues: search existing issues before creating duplicates; label and assign additively unless replacement is requested.
- Pull requests: fetch metadata before diffs; fetch file patches for targeted review; request changes only for concrete blockers.
- Actions: map commit SHA to runs, inspect failed jobs, and capture concise failure classes.
- Code security: summarize findings without disclosing exploit steps or sensitive raw output.
- Releases: generate notes from merged PRs and commits; keep publishing as a separate permission gate.

## Review Checklist

- Repository and target refs are unambiguous.
- The operation matches the user's authorization.
- Mutations are scoped and idempotent.
- Comments are concise and actionable.
- CI status and failure causes are checked before status claims.
- Generated PR bodies include summary, tests, and risk when the repo expects them.
- No secrets, raw identifiers, private logs, or local paths appear in GitHub-visible text.

## Verification

- For read tasks, cite the fetched issue, PR, commit, file, or workflow metadata used.
- For mutations, re-fetch the issue, PR, branch, comment, label, or run and confirm the desired state.
- For code edits, run local tests or repository validation where available before opening or updating a PR.
- For CI reruns, confirm the requested run or job was actually queued.

## Related Skills

- `skill-security-hooks`
- `skill-saas-security-scan`
- `skill-multiagent-orchestration`
- `skill-ai-orchestration`
