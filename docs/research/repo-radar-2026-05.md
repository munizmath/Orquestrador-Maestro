# Radar De Repositórios - Maio 2026

Este radar registra referências públicas recentes que podem orientar a evolução do Orquestrador Maestro. Ele não autoriza copiar código de terceiros. A regra é extrair padrões, respeitar licenças e transformar cada ideia em documentação, script ou skill própria do projeto.

Data da revisão: 2026-05-29 UTC.

## Critérios

- Atividade pública recente, preferencialmente `pushed_at` nos últimos 30 dias.
- Relação direta com agentes de IA, harness engineering, subagentes, MCP, skills, contexto, telemetria, atualização ou governança.
- Licença compatível ou uso apenas como referência conceitual.
- Padrão útil para um pacote público, sanitizado e instalável.

## Shortlist

| Repositório | Atividade verificada | Licença | Padrão útil | Como aproveitar no Orquestrador |
|---|---:|---|---|---|
| [`openai/codex`](https://github.com/openai/codex) | release `rust-v0.135.0` em 2026-05-28 | Apache-2.0 | CLI de agente terminal, leitura de contratos do projeto, MCP e evolução rápida de hooks. | Acompanhar contratos públicos de `AGENTS.md`, hooks e MCP, mas preservar compatibilidade do pacote em vez de seguir cada mudança alpha imediatamente. |
| [`google-gemini/gemini-cli`](https://github.com/google-gemini/gemini-cli) | release `v0.44.1` em 2026-05-28 | Apache-2.0 | CLI pública com update por npm, canais de release e contexto por projeto. | Documentar melhor `latest` e só criar `preview` ou `nightly` quando houver cadência real de release e validação. |
| [`ChromeDevTools/chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp) | release `chrome-devtools-mcp-v1.1.1` em 2026-05-27 | Apache-2.0 | MCP instalado por cliente, snippets de configuração e flags explícitas de privacidade/uso. | Futuro guia de templates MCP por ferramenta, sempre com alerta sobre dados expostos pelo navegador e flags de privacidade. |
| [`entireio/cli`](https://github.com/entireio/cli) | `pushed_at` 2026-05-28 | MIT | Sessões de agente ligadas ao Git, rastreabilidade, checkpoints e histórico pesquisável. | Futuro modo opt-in de rastreio local redigido, ligado a commits, sem publicar prompts, logs ou caminhos privados. |
| [`coleam00/archon`](https://github.com/coleam00/archon) | `pushed_at` 2026-05-28 | MIT | Workflows determinísticos com fases, gates, artefatos e validação. | Evoluir `DEV/` para planos/checkpoints mais padronizados e criar templates de fluxo repetível para tarefas longas. |
| [`ai-boost/awesome-harness-engineering`](https://github.com/ai-boost/awesome-harness-engineering) | `pushed_at` 2026-05-28 | CC0 no README | Taxonomia de harness: contexto, ferramentas, permissões, memória, observabilidade e verificação. | Usar como checklist público de maturidade para o Orquestrador, sem trazer catálogo inteiro para o runtime. |
| [`shinpr/sub-agents-mcp`](https://github.com/shinpr/sub-agents-mcp) | `pushed_at` 2026-05-24 | MIT | Subagentes definidos em Markdown e expostos para ferramentas compatíveis com MCP. | Manter agentes Codex como perfis portáveis e estudar camada MCP opcional para reutilizar subagentes entre ferramentas. |
| [`sbhooley/ainativelang`](https://github.com/sbhooley/ainativelang) | `pushed_at` 2026-05-27 | Apache-2.0, com aviso de licença desconhecida em parte do repo | Fluxos estruturados, grafos, estimativa de custo, dry-run e trilha de auditoria. | Inspirar um formato futuro de tarefa com passos, custos e gates, mas sem importar código nem arquivos com licença ambígua. |
| [`bonigarcia/context-engineering`](https://github.com/bonigarcia/context-engineering) | `pushed_at` 2026-05-28 | Apache-2.0 | Context engineering como prática: instruções, conhecimento externo, memória, ferramentas, estado, avaliação e governança. | Reforçar o modelo do Orquestrador como engenharia de contexto, não só prompt engineering. |
| [`deepset-ai/haystack`](https://github.com/deepset-ai/haystack) | `pushed_at` 2026-05-28 | Apache-2.0, com aviso de licença desconhecida em header | Pipelines explícitos para retrieval, roteamento, memória e geração. | Referência arquitetural para workflows futuros; não é dependência necessária do pacote atual. |
| [`MemTensor/MemOS`](https://github.com/MemTensor/MemOS) | release `v2.0.17` em 2026-05-26 | Apache-2.0 | Memória persistente, retrieval híbrida, colaboração multiagente e narrativa de economia de tokens. | Inspirar documentação de memória local-first e métricas de economia, sem adicionar serviço pesado ao instalador padrão. |
| [`andyrewlee/awesome-agent-orchestrators`](https://github.com/andyrewlee/awesome-agent-orchestrators) | `pushed_at` 2026-05-11 | Sem licença no snapshot revisado | Curadoria de orquestradores e agentes de coding. | Usar apenas como mapa de mercado; não copiar conteúdo sem licença clara. |

## Watchlist Complementar

| Repositório | Motivo | Decisão |
|---|---|---|
| [`gotalab/skillport`](https://github.com/gotalab/skillport) | SkillOps com CLI/MCP e ideia de gerenciar skills uma vez para servir em vários agentes. | Bom padrão conceitual, mas o `pushed_at` verificado foi 2026-01-08; fica como referência estável, não como novidade do mês. |
| [`aiming-lab/AutoHarness`](https://github.com/aiming-lab/AutoHarness) | Governança, custo, sessão, diagnóstico e perfis multiagente. | Relevante como inspiração de harness, mas o último push verificado foi 2026-04-02; usar como leitura complementar. |

## O Que Entrou Nesta Atualização

- README com radar resumido e explicação de como essas referências se conectam ao Orquestrador.
- Este documento como trilha pública de pesquisa, com data, licença e decisão.
- Ajuste em `docs/context-economy.md` para deixar explícito que a economia de tokens vem de camadas, gates, índices e reidratação sob demanda.
- `CONTRIBUTING.md` com checklist de contribuição segura.
- Changelog do README atualizado com entrada `Unreleased` sem data para diferenciar documentação no GitHub de release npm.

## Próximas Melhorias Recomendadas

1. Criar templates públicos em `docs/templates/` para `DEV/PLAN.md`, `DEV/IMPLEMENT.md`, `DEV/VERIFY.md` e `DEV/HANDOFF.md`.
2. Criar uma camada opt-in de trace local que registre apenas metadados redigidos: comando, status, arquivos públicos tocados e commit relacionado.
3. Padronizar agentes Codex em Markdown portátil para facilitar futura exposição via MCP.
4. Criar uma matriz de maturidade do Orquestrador: contexto, skills, hooks, permissões, memória, observabilidade, validação e atualização.
5. Manter telemetria do CLI anônima, opt-in, desativável e sem caminhos locais, alinhada ao modelo de privacidade.

## Regra De Licença

Referências com licença MIT, Apache-2.0 ou CC0 podem inspirar implementação, mas qualquer código novo deve ser escrito no padrão deste repositório. Repositórios sem licença clara entram apenas como referência de mercado ou leitura, sem cópia de código, texto ou assets.
