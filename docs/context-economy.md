# Economia De Contexto

O Orquestrador Maestro foi desenhado para reduzir tokens por organizacao, nao por compressao cega. A IA deve carregar primeiro contratos curtos, indices e roteadores; so depois abre arquivos maiores quando houver evidencia de necessidade.

As referencias externas mais uteis aqui continuam sendo duas ideias:

- RTK: compactar saidas de comandos antes que elas entrem no contexto da IA.
- Caveman: comprimir linguagem operacional e manter ativacoes consistentes em varias ferramentas.
- Ponytail: exigir a menor implementacao suficiente antes de criar abstracoes, dependencias ou codigo extra.
- React Doctor: usar gates deterministicos e diagnosticos objetivos quando a tecnologia tem ferramenta especializada.
- Headroom: tratar compressao como camada opt-in, reversivel e mensuravel, com recuperacao dos originais sob demanda.

No Orquestrador, isso virou uma regra pratica: contexto minimo suficiente, com reidratacao sob demanda.

## Camadas De Leitura

Ordem recomendada para qualquer IA instalada:

1. `AGENTS.md` global do usuario.
2. `.orquestrador/rules.md`.
3. `.orquestrador/maestro.md`.
4. `AGENTS.md` do projeto atual.
5. **CCP (mais fresco e barato): `DEV/context/_meta.json` → se fresco, `DEV/context/CONTEXT.md` + `INDEX.md` + `WORKLOG-DIGEST.md`** (ver "Compact Context Pack (CCP) E Frescor" abaixo). Caso contrário, siga para os arquivos DEV abaixo.
6. `DEV/README.md` ou `DEV/INDEX.md`.
7. `DEV/HANDOFF.md`.
8. `DEV/CONTEXT.md`.
9. `DEV/SPECS/ACTIVE.md`.
10. Roteadores compactos de skill.
11. `SKILL.md` especifico da tarefa.
12. Referencias internas da skill somente quando necessarias.

A IA nao deve abrir `skill-library/community-skills/` inteira, nem carregar a arvore `DEV/` completa por padrao.

## Arquivos Que Economizam Tokens

| Arquivo | Uso esperado |
|---|---|
| `SKILLS_INDEX.md` | Descobrir grupos de skills sem abrir o catalogo completo. |
| `SKILL_ALIASES.json` | Traduzir termos do usuario para uma skill canonica. |
| `SKILLS_ROUTER.json` | Confirmar skill, gatilhos, custo e risco. |
| `SKILL_CHAINS.json` | Saber quais skills auxiliares podem ser chamadas. |
| `SKILL_EXECUTION_PROFILES.json` | Limitar profundidade, paralelismo e validação. |
| `DEV/INDEX.md` | Mapear a documentacao local do projeto. |
| `DEV/HANDOFF.md` | Recuperar o snapshot atual sem reler historico. |
| `DEV/CONTEXT.md` | Recuperar estado, comandos, riscos e restricoes vivas. |
| `DEV/SPECS/ACTIVE.md` | Entender objetivo, escopo, aceite e verificacao esperada. |
| `DEV/WORKLOG.md` | Entender alteracoes recentes em poucas linhas. |
| `DEV/VERIFY.md` | Ver a ultima evidencia de conclusao sem reabrir logs completos. |
| `DEV/context/CONTEXT.md` | Snapshot fresco (repo+diff+testes) sem re-derivar estado. |
| `DEV/context/_meta.json` | Frescor do CCP (generated_at, head_sha, ttl) p/ o staleness guard. |
| `DEV/context/WORKLOG-DIGEST.md` | Últimas entradas do WORKLOG (~KBs) em vez do arquivo inteiro. |

## Compact Context Pack (CCP) E Frescor

Quando um projeto tem `DEV/context/` (gerado por coletores read-only; local-only,
não versionado), a IA deve **preferir o CCP a re-derivar estado** (rodar
`git status` / `docker ps` / grep) ou ler arquivos grandes (ex.: `DEV/WORKLOG.md`
inteiro). O CCP é opcional e retrocompatível: projeto sem `DEV/context/` segue o
fluxo normal.

Staleness guard (lazy — só reidrata quando vai usar):

1. Leia `DEV/context/_meta.json`.
2. Considere **fresco** se `agora - generated_at <= ttl_minutes` **e** `head_sha`
   == HEAD atual (`git rev-parse --short HEAD`).
3. Fresco → use `CONTEXT.md` / `INDEX.md` / `WORKLOG-DIGEST.md` do CCP.
4. Stale (TTL vencido, HEAD mudou ou sem `_meta.json`) → rode o refresh do projeto
   (ex.: `bash infra/rundeck/scripts/refresh_context_ccp.sh`) e então use; se não
   houver refresh disponível, caia para comandos ao vivo.

Nunca edite arquivos do CCP à mão (são gerados). Nada de segredo/PII no CCP.

## Hooks Compactos

Para economizar tokens de forma consistente, os hooks precisam ser shims, nao catalogos:

- `orquestrador/hooks.md` faz preflight, orcamento de contexto, verificacao e sync;
- hooks de ferramenta como Claude, Cursor, Gemini, Windsurf e OpenCode so apontam para `SKILL_EXECUTION_PROFILES.json`, `SKILL_ALIASES.json`, `SKILLS_ROUTER.json` e `SKILL_CHAINS.json`;
- o catalogo de gatilhos fica no roteador, nao repetido em cada `hooks.md`;
- o contexto de projeto fica em `HANDOFF + CONTEXT + ACTIVE SPEC`, nao em uma conversa gigantesca.

Regra pratica:

1. hook curto;
2. router primeiro;
3. `SKILL.md` so sob demanda;
4. `DEV/` so pelo indice e pelos arquivos de controle;
5. `WORKLOG.md` curto e arquivado periodicamente.

## Raizes Nativas Enxutas

Outro custo fixo importante nao vem do hook, e sim da pasta nativa de skills que algumas ferramentas inspecionam a cada sessao.

Padrao atual do Orquestrador:

- `.orquestrador/skill-library/community-skills` guarda a biblioteca comunitaria completa;
- `.orquestrador/skill-library/codex-skills` guarda o catalogo completo de workflows OMX/Codex;
- `.codex/skills` fica com um subconjunto essencial de workflows + `.system`;
- `.claude/skills`, `.opencode/skills`, `.cursor/skills`, `.gemini/skills`, `.windsurf/skills`, `.agents/skills` e `.antigravity-skills/skills` ficam so com as skills canonicas do manifesto.

Se uma dessas raizes voltar a ter centenas de diretorios, o custo por sessao sobe de novo mesmo com hooks compactos. Por isso `sync-skills` agora tambem offloada o excesso para `.orquestrador/skill-library/disabled-native`.

## Saidas De Comandos

A inspiracao do RTK entra como camada opt-in. O Orquestrador nao reescreve tudo por padrao.

Padrao recomendado:

- comecar por comandos compactos: `git status --short`, `git diff --stat`, `rg --files`, `rg "termo"`;
- para testes, priorizar falhas e resumos antes de logs completos;
- guardar saida longa em arquivo local quando util e resumir so o necessario na resposta;
- usar saida completa apenas quando o diagnostico depender dela.

## Combo Deterministico: Spec + Worklog + Script + Gate

Para evitar projeto girando em circulos por horas, a combinacao recomendada agora e:

1. `DEV/SPECS/ACTIVE.md`: fixa objetivo, escopo, aceite e plano de verificacao.
2. `DEV/WORKLOG.md`: registra mudancas recentes em poucas linhas.
3. `DEV/VERIFY.md`: registra comandos, resultado e pendencias.
4. `DEV/HANDOFF.md`: concentra o snapshot atual para a proxima sessao.
5. `compact-worklog`: move historico velho para `DEV/HANDOFFS/WORKLOG_ARCHIVE.md` e atualiza o handoff.
6. `check-dev-gates`: valida se a estrutura ainda esta compacta e utilizavel.

Com isso, a proxima IA nao depende de reler a conversa inteira nem um `WORKLOG` enorme. Ela recupera contexto por contrato, nao por adivinhacao.

## Gates De Otimizacao

A economia de contexto tambem depende de reduzir trabalho inutil antes dele existir.

| Gate | Quando usar | Efeito esperado |
|---|---|---|
| Implementacao minima suficiente | Antes de criar pacote, abstracao, componente novo ou subagente | Reduz diff, dependencia, manutencao e leitura futura |
| Gate especializado | Quando o stack tem diagnostico proprio, como React | Troca revisao subjetiva por achados verificaveis |
| Compressao opt-in | Quando outputs, logs, RAG ou historico passam do tamanho util | Mantem contexto curto e permite reidratacao do original |
| DEV gate | Antes de handoff ou tarefa longa | Garante spec, handoff, verify e worklog compactos |

Esses gates nao substituem a verificacao do projeto. Eles evitam que a IA gaste tokens resolvendo o problema errado, com contexto demais ou com solucao maior que o necessario.

## DEV Implementado

O modelo recomendado deixou de ser "futuro desejado" e passou a ser a estrutura publicada pelo inicializador:

| Arquivo | Finalidade |
|---|---|
| `DEV/HANDOFF.md` | Snapshot curto da sessao atual, pronto para a proxima IA. |
| `DEV/SPECS/ACTIVE.md` | Contrato da tarefa ativa. |
| `DEV/WORKLOG.md` | Historico curto das ultimas entradas. |
| `DEV/VERIFY.md` | Evidencia da ultima verificacao. |
| `DEV/HANDOFFS/WORKLOG_ARCHIVE.md` | Historico mais antigo movido para fora do caminho padrao de leitura. |

Comandos:

```bash
orquestrador-maestro init-dev --project-path .
orquestrador-maestro compact-worklog --project-path . --keep 12
orquestrador-maestro check-dev-gates --project-path . --max-entries 12 --strict
```

## Regra Para Agentes

Quando o contexto estiver grande, a IA deve responder com algo equivalente a:

```text
Vou consultar o indice, o handoff e a spec ativa, e abrir apenas os documentos necessarios.
```

Depois disso, ela deve citar quais arquivos abriu e por que. Isso mantem rastreabilidade sem gastar tokens em leitura ampla.
