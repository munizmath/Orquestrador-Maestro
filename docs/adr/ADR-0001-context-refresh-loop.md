# ADR-0001 — Context Refresh Loop (Rundeck → CCP → Maestro)

- **Data:** 2026-06-19
- **Status:** Aceito (decisão do maestro/dono)
- **Escopo:** Orquestrador-Maestro (convenção canônica) + LOC.IA (primeira prova de loop)
- **Autores:** dono (maestro) + Claude (orquestrador/DEV)

## Contexto

O dono opera vibe-coding com múltiplas IAs (Claude Opus/Sonnet/Fable, Codex) e
quer reduzir consumo de token mantendo contexto atualizado e documentação que as
IAs leiam barato. Existem dois ativos já instalados que, isolados, não entregam isso:

1. **Orquestrador-Maestro** — camada portátil de contrato operacional. Define a
   **ordem de leitura** das IAs (`AGENTS.md` → `rules.md` → `maestro.md` →
   `AGENTS.md` do projeto → `DEV/INDEX.md`/`DEV/CONTEXT.md`/`DEV/WORKLOG.md` →
   routers → `SKILL.md`) e a filosofia "contexto mínimo suficiente, com
   reidratação sob demanda" (ver `docs/context-economy.md`).

2. **Rundeck** (instância local `localhost:14440`, stack LOC.IA) — motor de
   agendamento com ~112 jobs. Os coletores *read-only* já produzem um contrato
   JSON compacto (`schema_version 1.0`, com `compact_summary`) — exatamente o
   artefato economizador de token desejado.

### Problema observado (forense, 2026-06-19)

- Os coletores rodam (~300 execuções/dia) e **descartam** o JSON compacto no
  `.rdlog` — ninguém consome. Valor fabricado e jogado fora.
- O Rundeck consome **2.77 GiB** de RAM (maior container da stack) sem entregar
  contexto a nenhuma IA.
- No LOC.IA, `DEV/CONTEXT.md` estava **18 dias estagnado** (01/jun), `DEV/WORKLOG.md`
  tem **91 KB** (caro de ler inteiro) e **`DEV/INDEX.md` não existe** — embora o
  contrato do Maestro mande lê-lo.
- A IA, a cada sessão, **re-deriva** estado que o Rundeck já sabe: roda
  `git status`, `docker ps`, grep de log e lê arquivos grandes — gasto recorrente
  de token.

### Fato habilitador

O runner do Rundeck **já monta o repositório em leitura-e-escrita**:
`/home/mathe/Projetos/LOC.IA => /locia (rw)`. Logo, o motor pode escrever o
contexto compacto direto na pasta que as IAs leem — **sem sync nem cópia**.

## Decisão

Fechar o loop: o **Rundeck (motor de escrita)** passa a gerar e manter um
**Compact Context Pack (CCP)** nos arquivos que o **contrato de leitura do
Maestro** já consome. Assim o fluxo normal da IA bate em contexto fresco e
pequeno, em vez de re-derivar estado.

Decisões específicas tomadas pelo maestro:

1. **CCP é local-only (`.gitignore`).** O bundle gerado não é commitado: zero
   risco de vazar segredo/PII no GitHub e zero churn. Apenas a *especificação*
   (este ADR + plano + schema) é versionada.
2. **Escopo 1+2.** Provar o loop primeiro no LOC.IA (onde o mount rw já existe)
   **e** desenhar o CCP como convenção do Orquestrador-Maestro, válida para os
   demais projetos (Fluvius, FinanceiroLocal, etc.).
3. **Somente jobs read-only** alimentam o CCP. Nenhum job *mutating*/critical
   entra no loop.

## Consequências

### Positivas
- IA lê ~4–6 KB pré-digeridos em vez de re-rodar comandos + ler 91 KB de WORKLOG.
- `DEV/CONTEXT.md` e `DEV/INDEX.md` deixam de estagnar (regenerados por gatilho).
- Os 2.77 GiB e os jobs ganham um consumidor real ("fazem jus").
- Padrão reusável em todos os projetos via Maestro.

### Custos / riscos
- Requer **gate de redaction** antes de gravar (sem segredo/PII), mesmo local-only.
- **Staleness**: contexto pré-gerado pode envelhecer → mitigado por `_meta.json`
  com `generated_at`/hash do HEAD e regra de frescor no contrato do Maestro.
- Dependência operacional do runner para o caminho agendado → mitigada pelo
  gatilho `post-commit` local (caminho quente sem JVM).

## Alternativas consideradas

- **Aposentar o Rundeck** e chamar os scripts PowerShell direto. Mais leve, mas
  perde agendamento, multi-node/HML, retries e trilha de auditoria. Rejeitada
  nesta rodada (o dono optou por aproveitar o Rundeck).
- **Commitar o CCP.** Beneficiaria Codex cloud/Fable, mas gera churn e amplia a
  superfície de vazamento. Rejeitada (local-only escolhido).

## Referências
- `docs/context-economy.md` (filosofia de economia de contexto)
- `docs/context-refresh-loop-plan.md` (plano de implementação + schema do CCP)
- LOC.IA: `infra/rundeck/jobs/*-readonly.yaml`, `DEV/STATE.md`, `DEV/WORKLOG.md`
