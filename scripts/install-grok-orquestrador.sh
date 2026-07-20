#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GROK_ROOT="${GROK_HOME:-$HOME/.grok}"
mkdir -p "$GROK_ROOT"
cp "$REPO_ROOT/tool-profiles/grok/config.toml" "$GROK_ROOT/config.toml"
mkdir -p "$HOME/.agents"
if [[ ! -f "$HOME/AGENTS.md" ]]; then
  cat > "$HOME/AGENTS.md" <<'EOF'
# Global Orquestrador Maestro

Read `~/.orquestrador/rules.md` and `~/.orquestrador/maestro.md` before substantive work.
EOF
fi
printf 'Grok config: %s\nSkills: %s\nGlobal agents: %s\n' "$GROK_ROOT/config.toml" "$HOME/.agents/skills" "$HOME/AGENTS.md"
