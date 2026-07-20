# Radar De Catálogos Externos

Este radar registra fontes externas avaliadas para aumentar o ROI do Orquestrador-Maestro. Ele deve orientar curadoria, não importação em massa.

Modo atual: `local-only`. Entradas deste radar orientam a instalação local e o worktree atual até o usuário pedir explicitamente publicação, release ou sincronização pública.

## Fontes Avaliadas

| Fonte | Link | Categoria | ROI | Status | Itens Absorvidos | Itens Rejeitados | Última Revisão | Próximo Passo |
|---|---|---|---:|---|---|---|---|---|
| `czlonkowski/n8n-mcp` | `https://github.com/czlonkowski/n8n-mcp` | n8n, MCP, workflows | 5 | Em uso | Checklist n8n, templates-first, validação de nodes/workflows, validação antes de ativação, contratos de entrada/saída. | Importação de workflows brutos e comandos dependentes de runtime externo. | 2026-05-26 | Reavaliar quando houver ferramenta local n8n MCP disponível. |
| `evolution-foundation/evolution-api` | `https://github.com/EvolutionAPI/evolution-api` | WhatsApp, Evolution API | 5 | Em uso | Lifecycle de instâncias, n8n + Evolution API, filas, webhooks, provider message ID, reconexão, eventos append-only. | Detalhes operacionais que exigem segredos, instâncias reais ou logs privados. | 2026-05-26 | Atualizar guardrails quando o projeto adotar provider específico. |
| `github/github-mcp-server` | `https://github.com/github/github-mcp-server` | GitHub, MCP | 5 | Em uso | Skill `skill-github-mcp-automation` com gates para issues, PRs, Actions, releases e manutenção. | Mutação automática de push, merge, release, permissões e webhooks sem autorização explícita. | 2026-05-26 | Revisar quando o conector GitHub mudar toolset ou permissões. |
| `anthropics/skills` | `https://github.com/anthropics/skills` | Agent Skills | 4 | Absorvido parcialmente | Padrão de frontmatter, seções compactas, progressive disclosure, verificação obrigatória e validator de qualidade. | Cópia integral de skills e exemplos com contexto/runtime específico. | 2026-05-26 | Usar como referência para novas skills canônicas. |
| `wshobson/agents` | `https://github.com/wshobson/agents` | Multiagentes | 4 | Absorvido parcialmente | Papéis de planner, executor, reviewer, verifier, security reviewer, documentação, ownership e handoff. | Catálogo completo de agentes e sobreposição de papéis redundantes. | 2026-05-26 | Reavaliar se houver lacunas reais de agente. |
| `SuperClaude_Framework` | `https://github.com/SuperClaude-Org/SuperClaude_Framework` | Claude Code, comandos | 3 | Radar | Referência conceitual para comandos, personas e execução estruturada. | Importar personas/comandos em massa ou duplicar modos existentes. | 2026-05-26 | Absorver somente quando reduzir ambiguidade em prompts Codex. |
| Awesome lists de Claude/MCP/agentes | Vários | Descoberta | 3 | Radar | Fonte para descobrir lacunas futuras. | Importação direta de listas, prompts genéricos e ferramentas sem manutenção local. | 2026-05-26 | Revisar trimestralmente ou quando surgir dor recorrente. |

## Regras Do Radar

- Registrar fonte, categoria, ROI, status e absorção concreta.
- Não adicionar catálogos ao Orquestrador sem mapear para skill, hook, router, docs ou validador.
- Preferir uma melhoria pequena e verificável a uma importação ampla.
- Revisar fontes externas antes de usá-las como base de mudança, pois repositórios e toolsets mudam.

## Próximas Revisões

1. Reavaliar `anthropics/skills` quando novas skills canônicas forem adicionadas.
2. Reavaliar `wshobson/agents` quando houver evidência de lacuna de papel multiagente.
3. Reavaliar `SuperClaude_Framework` apenas para padrões que reduzam ambiguidade ou melhorem verificação.
4. Manter este radar local enquanto a curadoria do ROI não for destinada à publicação.
