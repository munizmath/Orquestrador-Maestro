# Plano de Implementação — Context Refresh Loop

> Decisão em [`docs/adr/ADR-0001-context-refresh-loop.md`](adr/ADR-0001-context-refresh-loop.md).
> Objetivo: transformar o Rundeck (motor de escrita) + Maestro (contrato de
> leitura) em um loop que mantém contexto fresco e barato para as IAs.

## 1. Modelo mental

```
Rundeck collectors (read-only) --output_json_path--> DEV/context/ (CCP, local-only)
        ^ schedule / on-commit / on-demand                    |
        |                                                      v
   git post-commit hook                         Maestro reading order -> IA lê barato
```

- **Maestro** = o que a IA lê (ordem de leitura + economia de contexto).
- **Rundeck** = mantém esses arquivos frescos (agendamento, multi-node, auditoria).
- **CCP** = o artefato compacto no meio, gerado e nunca editado à mão.

## 2. Compact Context Pack (CCP) — contrato canônico

Diretório `DEV/context/` em cada projeto. **Local-only** (entra no `.gitignore`).
Todos os arquivos são **derivados de jobs read-only** e passam por redaction.

| Arquivo | Origem (job/coletor) | Conteúdo (compacto) |
|---|---|---|
| `repo-state.json` | `*-repo-health-summary-readonly` + `*-git-diff-summary-readonly` | branch, dirty, ahead/behind, últimos N commits, arquivos tocados |
| `stack-status.json` | `*-stack-status-compact-readonly` | docker ps compacto + health por serviço |
| `errors.json` | `*-error-aggregator-readonly` | top erros recentes (janela curta) |
| `tests.json` | `*-test-summary-readonly` | último resultado de teste (resumo, não log) |
| `CONTEXT.md` | rollup gerado | substitui o `DEV/CONTEXT.md` estagnado |
| `INDEX.md` | rollup gerado | mapa do `DEV/` (o Maestro pede e hoje não acha) |
| `WORKLOG-DIGEST.md` | tail de `DEV/WORKLOG.md` | últimas N entradas (~3 KB vs 91 KB) |
| `_meta.json` | gerador | `generated_at`, `head_sha`, lista de geradores, `stale` |

### Schema `_meta.json` (v1)

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-06-19T18:17:05Z",
  "head_sha": "f96f0aa1c",
  "repo_dirty": false,
  "generators": ["repo-health-summary", "stack-status-compact", "error-aggregator"],
  "stale": false,
  "stale_reason": null,
  "ttl_minutes": 30
}
```

**Regra de frescor (staleness guard):** `stale = true` se
`now - generated_at > ttl_minutes` **ou** `head_sha != HEAD atual`. A IA, ao ver
`stale=true`, dispara `refresh-context` ou cai para comandos ao vivo.

### Invariantes de segurança (rules de privacidade)
- Sem segredo/token/credencial; sem PII (placa, CPF/CNPJ, nome, e-mail, telefone).
- Só metadados e resumos; nunca payload bruto de log/query.
- Geração falha-fechada: se redaction não puder ser garantida, não grava.

## 3. Modelo de gatilho (híbrido)

| Gatilho | Motor | Quando | Por quê |
|---|---|---|---|
| Agendado | Rundeck | cadência sã enquanto trabalha | frescor ambiente; reaproveita slots dos jobs HML de 20min ociosos |
| On-commit | git `post-commit` | após cada commit | CCP instantâneo, caminho quente, sem JVM |
| On-demand | job `refresh-context` (UI/API) | início de sessão / `stale=true` | reidratação explícita |
| Multi-node/HML | Rundeck | coleta remota | retries, SSH, trilha de auditoria |

## 4. Encaixe no Maestro (convenção generalizada — escopo 2)

1. **Ordem de leitura** (`orquestrador/maestro.md` + `context-economy.md`):
   acrescentar `DEV/context/_meta.json` e `DEV/context/CONTEXT.md` como **primeira
   parada de estado**, antes de re-derivar via comandos.
2. **Hook novo** (`orquestrador/hooks.md`): *"Antes de re-derivar estado
   (git/docker/grep), leia `DEV/context/_meta.json`. Se `stale=false`, use o CCP.
   Se `stale=true`, dispare `refresh-context` ou caia para comandos ao vivo."*
3. **Tabela de arquivos que economizam token** (`context-economy.md`): adicionar a
   linha do CCP.
4. O CCP é **opcional e retrocompatível**: projeto sem `DEV/context/` segue o
   fluxo atual sem quebrar.

## 5. Binding LOC.IA (primeira prova — escopo 1)

- Runner já monta o repo em `/locia (rw)` — escrever em `/locia/DEV/context/`.
- Coletores-alvo já existentes: `locia-dev-repo-health-summary-readonly`,
  `locia-dev-git-diff-summary-readonly`, `locia-hml-stack-status-compact-readonly`,
  `locia-hml-error-aggregator-readonly`, `locia-dev-test-summary-readonly`.
- Adicionar `DEV/context/` ao `.gitignore` do LOC.IA.
- Aposentar/realocar os 3 jobs HML de 20min (sem consumidor hoje) para alimentar o CCP.

## 6. Entrega incremental (PRs ≤ 400 linhas)

| PR | Escopo | Risco | Critério de aceite |
|---|---|---|---|
| **PR0** | Este ADR + plano + schema do CCP | nenhum | docs revisados |
| **PR1** | `output_json_path` dos coletores → `DEV/context/*.json`; `.gitignore` | baixo | JSONs aterrissam no repo após execução |
| **PR2** | Script/job `context-rollup`: JSON → `CONTEXT.md`+`INDEX.md`+`WORKLOG-DIGEST.md`+`_meta.json` | baixo | rollup gerado com header de frescor |
| **PR3** | Convenção Maestro: ordem de leitura + hook + staleness guard | baixo | hooks.md/maestro.md/context-economy.md atualizados |
| **PR4** | Gatilhos: `refresh-context` + `post-commit` hook; realocar jobs HML 20min | médio | CCP atualiza on-commit; schedule limpo |
| **PR5** | Evidência de economia: medir contexto antes/depois | nenhum | nº de bytes/tokens lidos por sessão documentado |

## 7. Métrica de sucesso

- "Bytes de estado lidos por início de sessão" cai de (git status + docker ps +
  grep + 91 KB WORKLOG) para (CCP ~4–6 KB).
- `DEV/CONTEXT.md`/`INDEX.md` nunca mais estagnam > `ttl_minutes` enquanto há atividade.
- Rundeck deixa de gerar artefato descartado: 100% das execuções read-only têm consumidor.

## 8. Decisões em aberto (para próximas rodadas)
- Cadência exata do agendamento (sugestão: ligado ao horário de trabalho, não 24/7).
- Onde gerar o rollup `.md`: dentro do job Rundeck ou num script `post-collect` separado.
- `ttl_minutes` por projeto (default sugerido: 30).
