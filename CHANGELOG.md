# Changelog

All notable changes to Orquestrador Maestro are documented here.

## Unreleased

### Added
- `skill-lgpd-brasil` as a new canonical LGPD/privacy skill in `orquestrador/skills/`, with routing for dados pessoais, consentimento, RIPD, direitos do titular, retenção, incidentes, and transferências internacionais.
- June 2026 radar now includes Ponytail, React Doctor, and Headroom as references for minimal implementation gates, deterministic React review, and opt-in context compression.
- README community contribution section now records Hector Noya and Felinto from Grupo IAPro as collaborators in the Ponytail, React Doctor, and Headroom improvement track.

### Changed
- README, catalog, aliases, and router now surface the LGPD skill alongside the existing privacy-related and SaaS routing skills.
- `docs/research/repo-radar-2026-06.md` was rewritten with clean UTF-8 text and expanded decisions for context optimization, React gates, and reversible compression.

### Fixed
- Unix installer and verifier scripts now guard empty Bash arrays so `install.sh` and `scripts/verify-install.sh` remain compatible with macOS `/bin/bash` 3.2 under `set -euo pipefail`.

## 0.1.2 - 2026-06-29

### Added
- `skill-cobranca-automatizada-saas-abacatepay` as a new canonical billing skill in `orquestrador/skills/`, with routed triggers for cobrança automatizada, régua de cobrança, fatura, dunning, trial expiration, invoice portal, and billing admin flows.
- `orquestrador-maestro changelog` to expose the bundled release notes and the recommended update flow for existing installs.
- `orquestrador-maestro doctor` to expose the installation diagnostic already shipped in `orquestrador/doctor.ps1`.
- `orquestrador-maestro init-dev` to scaffold the compact `DEV/` hierarchy with `HANDOFF.md`, `SPECS/ACTIVE.md`, `VERIFY.md`, and a short `WORKLOG.md`.
- `orquestrador-maestro compact-worklog` and `orquestrador-maestro check-dev-gates` to keep project memory compact, archive cold worklog history, and validate the `spec + handoff + verify + worklog` contract.
- `docs/research/repo-radar-2026-06.md` with the June 26, 2026 research pass over `tenfoldmarc/website-builder-setup`, `bradautomates/claude-video`, `anthropics/claude-cookbooks`, and the public Google Drive library shared in this review.
- `docs/reference-packs.md` and `orquestrador/REFERENCE_PACKS.md` to standardize local-only reference packs for private Drive exports, PDFs, internal docs, and study libraries without publishing that material.

### Changed
- README and the public skill catalog now surface the automated billing skill alongside the existing AbacatePay, Stripe, limits, and admin routes.
- README now exposes the latest audited update date, a tighter installed-user update flow, the June 2026 radar, and the UX/UI stack built around `skill-open-design-ui`, `skill-modern-ui-patterns`, and `skill-frontend-ux-guardrails`.
- README, `docs/project-dev-hierarchy.md`, `docs/context-economy.md`, `docs/orquestrador-reference.md`, `docs/installation.md`, and `docs/npm-package.md` now describe the deterministic project loop based on `HANDOFF.md`, `SPECS/ACTIVE.md`, `VERIFY.md`, `check-dev-gates`, and `compact-worklog`.
- `docs/update-flow.md` now requires updating both `CHANGELOG.md` and the README summary before publish, plus a package-level smoke flow with `changelog`, `update`, `verify`, and `doctor`.
- `docs/npm-package.md` now treats `changelog` and `doctor` as first-class CLI commands alongside install, update, verify, uninstall, and telemetry.
- Contribution guidance now uses `CHANGELOG.md` as the canonical history and keeps the README as the fast summary users read before updating.
- Tool hooks for Claude, Cursor, Gemini, Windsurf, and OpenCode now act as compact shims and delegate trigger selection to `SKILL_EXECUTION_PROFILES.json`, `SKILL_ALIASES.json`, `SKILLS_ROUTER.json`, and `SKILL_CHAINS.json` instead of embedding large skill catalogs.
- `docs/context-economy.md`, `docs/orquestrador-reference.md`, and the README now document the compact-hook architecture explicitly so future updates keep routing centralized.
- Instaladores e sincronizadores agora mantêm as raízes nativas de skills enxutas em todos os clientes suportados, movendo bibliotecas grandes para `.orquestrador/skill-library/` e offloadando excesso para `.orquestrador/skill-library/disabled-native`.

### Fixed
- O conjunto nativo minimo do Codex agora preserva `orquestrador-maestro`, `doctor` e `ralplan`, evitando divergencia entre a politica enxuta de skills e os perfis instalados.
- Existing installs now have an explicit post-update verification path: `npm update -g`, `orquestrador-maestro changelog`, `orquestrador-maestro update`, `orquestrador-maestro verify`, and `orquestrador-maestro doctor`.
- `orquestrador/doctor.ps1` no longer treats legitimate accented UTF-8 text such as `PADRÃO` as mojibake just because it contains `Ã`.
- Validation and install health checks now flag legacy oversized hook catalogs before they drift back into the public snapshot or a local install.
- `sync-skills.ps1`, `sync-skills.sh`, `verify-install.ps1`, `verify-install.sh`, and `doctor.ps1` agora detectam raízes nativas de skills infladas, restauram o conjunto mínimo gerenciado e deixam de empurrar centenas de diretórios para cada cliente por padrão.

### Security
- Private reference libraries from sources like Google Drive are now documented as local-only packs. They are intentionally not vendored into the public snapshot and must be indexed before agents read them.
- The new CLI commands stay inside the same privacy model: no local paths, project contents, tokens, or personal identifiers are required to read release notes or run diagnostics.

### Migration
- Users should update with:
  - `npm update -g @iapro/orquestrador-maestro-cli`
  - `orquestrador-maestro changelog`
  - `orquestrador-maestro update`
  - `orquestrador-maestro verify`
  - `orquestrador-maestro doctor`
- Existing installs with hundreds of native skills will be compacted during `orquestrador-maestro update`, and the offloaded directories will be preserved under `.orquestrador/skill-library/disabled-native`.
- Projects that want the new low-token workflow should run `orquestrador-maestro init-dev --project-path .` and keep `DEV/HANDOFF.md`, `DEV/SPECS/ACTIVE.md`, `DEV/VERIFY.md`, and a compact `DEV/WORKLOG.md` current.

## 0.1.1 - 2026-05-25

### Added
- GIFs in the README for installation, runtime flow, and safe update flow.
- `scripts/generate-readme-gifs.py` to regenerate the visual assets with consistent layout.
- `npm run audit` and `npm run outdated:all` to audit the root package and example workspaces with lockfiles.

### Changed
- README reorganized to explain the mental model, hierarchy, `DEV/` usage, and update flow before the full file map.
- Dependency set refreshed inside the supported Node.js 18+ compatibility window.

### Security
- npm audit cleared for packages with lockfiles while intentionally holding back incompatible major upgrades such as `better-sqlite3@12` and `express@5`.

### Migration
- No breaking migration expected. Installed users can update with `npm update -g @iapro/orquestrador-maestro-cli`, then `orquestrador-maestro update` and `orquestrador-maestro verify`.

## 0.1.0 - 2026-05-25

### Added
- First public npm release of `@iapro/orquestrador-maestro-cli`.
- CLI commands `install`, `update`, `verify`, `list-targets`, and `uninstall`.
- Public snapshot with Orquestrador core, Codex skills, tool profiles, hooks, and installation documentation.

### Security
- Public validation gates to block tokens, logs, caches, backups, local memories, real user paths, and private files from the published snapshot.
