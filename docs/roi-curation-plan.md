# Plano De Curadoria Para Maximizar ROI

Este plano orienta como absorver o melhor de catálogos externos sem transformar o Orquestrador-Maestro em um repositório inchado, duplicado ou difícil de manter. A regra principal é destilar padrões comprovados em skills pequenas, roteáveis, verificáveis e seguras.

Escopo atual: execução local. As mudanças derivadas deste plano ficam no worktree local até o usuário pedir explicitamente commit, push, release ou publicação.

## Objetivo

Transformar catálogos, frameworks e repositórios externos em melhorias práticas para:

- aumentar a utilidade real do Orquestrador em projetos;
- reduzir repetição de prompts e gasto de contexto;
- melhorar roteamento de skills, hooks e perfis de ferramentas;
- fortalecer integrações com n8n, WhatsApp, Claude, GitHub e MCPs;
- manter o snapshot público sanitizado e auditável.

## Critérios De ROI

Avalie cada fonte externa com esta matriz antes de absorver qualquer conteúdo.

| Critério | Peso |
|---|---:|
| Resolve dor frequente do usuário | 5 |
| Melhora execução real de agentes | 5 |
| Reduz tokens/contexto | 4 |
| Aumenta segurança/verificação | 4 |
| Reaproveitável entre Codex, Claude, Cursor, OpenCode e outras ferramentas | 4 |
| Baixo risco de importar duplicação ou conteúdo genérico | 3 |
| Fácil de manter no snapshot público | 3 |

Absorva apenas itens com aplicação clara em skills, hooks, roteadores, documentos operacionais ou validadores.

## Fontes Prioritárias

| Fonte | Absorver Como |
|---|---|
| `anthropics/skills` | Padrão de escrita, progressive disclosure, estrutura e testes de skills. |
| `czlonkowski/n8n-mcp` | Boas práticas n8n, validação de workflows, templates-first e configuração correta de nós. |
| `EvolutionAPI/evolution-api` | Guardrails reais para WhatsApp, instâncias, QR, reconexão, filas, webhooks e eventos. |
| `github/github-mcp-server` | Automação GitHub via MCP para issues, PRs, Actions, manutenção e revisão. |
| `wshobson/agents` | Presets multiagente, papéis de agentes e padrões de avaliação de workflows. |
| `SuperClaude_Framework` | Benchmark para comandos, personas, execução estruturada e integração com Claude Code. |
| Awesome lists de Claude, MCP e agentes | Radar de oportunidades. Não importar em massa. |

## Pipeline De Curadoria

```text
Descobrir catálogo
  -> classificar por categoria
  -> selecionar padrões de alto ROI
  -> mapear para skill existente ou nova skill
  -> escrever versão compacta e sanitizada
  -> validar formato, segurança e duplicação
  -> atualizar router, aliases, chains e índices
  -> testar em uma tarefa real
```

Nenhum catálogo deve entrar bruto. O Orquestrador absorve padrões, não volume.

## Onda 1: Alto ROI Imediato

### 1. Fortalecer n8n + WhatsApp + Claude

Arquivo principal:

- `orquestrador/skills/skill-n8n-whatsapp-claude/SKILL.md`

Absorver de `czlonkowski/n8n-mcp`:

- validação antes de ativar workflow;
- configuração operation-aware de nodes;
- uso de templates como ponto de partida;
- checagem de dependências entre campos de node;
- workflow com contrato estável de entrada e saída.

Adicionar à skill:

- checklist de workflow n8n;
- padrão de webhook inbound;
- dedupe antes de chamar Claude;
- fila antes de enviar WhatsApp;
- validação de saída estruturada;
- auditoria sanitizada.

### 2. Fortalecer WhatsApp/Evolution API

Arquivo principal:

- `orquestrador/skills/skill-evolution-api/SKILL.md`

Absorver de `EvolutionAPI/evolution-api`:

- lifecycle de instâncias;
- QR pairing e expiração;
- estados de conexão e reconexão;
- eventos append-only;
- provider message ID para dedupe;
- integração segura com n8n.

Adicionar uma seção específica:

- `n8n + Evolution API`

### 3. Criar automação GitHub via MCP

Nova skill sugerida:

- `orquestrador/skills/skill-github-mcp-automation/SKILL.md`

Escopo:

- triagem de issues;
- revisão de PRs;
- leitura de Actions;
- changelog e release notes;
- manutenção do próprio Orquestrador;
- regras para não fazer push, merge ou publish sem autorização.

## Onda 2: Qualidade Das Skills

### 4. Revisar skills canônicas contra boas práticas Anthropic

Aplicar a todas as skills canônicas:

- frontmatter consistente;
- descrição acionável;
- seções compactas;
- uso progressivo de referências;
- seção obrigatória de verificação;
- guardrails proporcionais ao risco.

Formato preferencial:

```text
Core Workflow
Guardrails
Verification
Related Skills
```

### 5. Criar validador de qualidade de skills

Objetivo:

- identificar descrição genérica;
- identificar skill sem verificação;
- identificar skill de risco sem guardrails;
- detectar duplicação entre skills;
- garantir presença no manifesto, router, aliases e catálogo quando aplicável.

Preferência:

- integrar ao fluxo existente de `scripts/validate-skills.*`;
- manter saída curta e acionável.

## Onda 3: Multiagentes E Execução

### 6. Melhorar multiagent orchestration

Arquivo principal:

- `orquestrador/skills/skill-multiagent-orchestration/SKILL.md`

Absorver de catálogos de agentes:

- papéis úteis e não redundantes;
- padrões de posse de arquivos;
- handoff entre agentes;
- revisão e integração final;
- critérios para quando não usar multiagentes.

Papéis candidatos:

- planner;
- executor;
- reviewer;
- verifier;
- security reviewer;
- documentation maintainer.

### 7. Melhorar prompts e agentes Codex

Arquivos candidatos:

- `codex/prompts/*.md`
- `codex/skills/team/SKILL.md`
- `codex/skills/ralph/SKILL.md`
- `codex/skills/code-review/SKILL.md`

Absorver apenas padrões que:

- reduzam ambiguidade;
- melhorem verificação;
- evitem retrabalho;
- mantenham compatibilidade com a hierarquia do Orquestrador.

## Onda 4: Radar Permanente

### 8. Criar radar de catálogos externos

Arquivo sugerido:

- `docs/external-catalog-radar.md`

Conteúdo:

- catálogo avaliado;
- link;
- categoria;
- pontuação de ROI;
- itens absorvidos;
- itens rejeitados;
- data da última revisão;
- próximo passo.

### 9. Manter política de absorção

Este documento é a política inicial. Atualize quando houver mudança real no processo de curadoria.

## Política De Absorção

- Não importar skills inteiras sem revisão.
- Não copiar comandos que dependam de runtime específico sem fallback.
- Não adicionar integração que exija segredo no cliente.
- Não adicionar skill sem seção de verificação.
- Não adicionar catálogo que aumente contexto sem melhorar execução.
- Preferir uma skill canônica forte a várias skills parecidas.
- Tudo que envolver WhatsApp, GitHub, n8n, Claude ou MCP precisa cobrir segurança, idempotência e logs sanitizados.
- Todo novo item canônico deve passar por manifesto, router, aliases ou chains quando aplicável.

## Métricas De Sucesso

| Métrica | Direção Esperada |
|---|---|
| Tempo para escolher skill correta | Reduzir |
| Prompts repetidos pelo usuário | Reduzir |
| Falhas por workflow incompleto | Reduzir |
| Skills com seção de verificação | Chegar a 100% |
| Integrações com segredo server-side | Chegar a 100% |
| Catálogos externos absorvidos sem duplicação | Aumentar |
| Tarefas reais concluídas com menos contexto | Aumentar |

## Próxima Execução Recomendada

Começar pela Onda 1:

1. melhorar `skill-n8n-whatsapp-claude`;
2. melhorar `skill-evolution-api`;
3. criar `skill-github-mcp-automation`;
4. atualizar roteadores, aliases, chains, índices e catálogo;
5. validar JSON, skills e sanitização pública.

## Status De Execução

Atualizado em 2026-05-26:

- Onda 1 concluída.
- `skill-n8n-whatsapp-claude` recebeu checklist de workflow, validação em camadas e padrões de configuração n8n.
- `skill-evolution-api` recebeu seção `n8n + Evolution API` e guardrails de lifecycle de instâncias.
- `skill-github-mcp-automation` foi criada como skill canônica e espelhada para Codex.
- Router, aliases, chains, índices e catálogo foram atualizados para as novas rotas.
- Onda 2 concluída localmente: skills canônicas receberam verificação/relacionamentos faltantes e o validador de skills passou a checar descrição genérica, verificação, guardrails para risco médio/alto, duplicidade e presença no catálogo.
- Onda 3 concluída localmente: `skill-multiagent-orchestration`, prompts/agentes Codex principais e skills `team`, `ralph` e `code-review` receberam regras de ownership, handoff, não sobreposição e integração final.
- Onda 4 concluída localmente: `docs/external-catalog-radar.md` passou a registrar links, ROI, absorções, rejeições, última revisão e próximo passo.
- Validação oficial executada com `npm run validate`: sanitização local e catálogo de skills aprovados.
