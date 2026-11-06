# Maestro — Casos de Uso (USE_CASES)

## Fix pequeno

```text
bug → contexto (brief+DEV) → skill → alteração → teste (verification engine)
```

## Feature

```text
intenção → contexto → planejamento → implementação → verificação → evidência
```

## Mudança arquitetural

```text
risco (governance) → architecture-first → plano → implementação → review independente
```

Só Codex suporta review read-only; demais providers retornam indisponível.

## Trabalho multiagente

```text
mission → graph → workspaces/worktrees isolados → integração manual → verificação
```

Este é o fluxo multiagente atualmente suportado pelo runtime: não há merge
automático, e a integração de volta é manual e revisada. Isso não demonstra que
a integração automática Nexus/OpenCode do Autopilot esteja disponível; ela
depende do contrato do adaptador, da capacidade observável e dos leases do
runtime correspondente.

## Continuação entre sessões

```text
DEV + memória episódica + estado de run/task → resume
```

Promoção para `DEV/` só via `memory promote --apply` com `verified:true`.

## Troca de ferramenta

Sobrevivem: regras, contexto, skills, memória, runs, evidência.
Dependem do provider: execução, sessão, permissões, streaming, review.

## Autopilot (limites reais)

`autopilot` = controlador de uma missão brief→requisitos→design→plano→
implementação→recuperação→QA→review→handoff com evidência. Ele mantém os cinco
artefatos fixos de uma missão, convoca o conselho quando a recuperação exige
diagnóstico multidisciplinar e continua lanes independentes enquanto uma tarefa
aguarda.

O scheduler, a capacidade global, os leases e o fencing pertencem ao sistema
Maestro; o Autopilot solicita recursos e coordena a própria missão. Um bloqueio
de tarefa não paralisa automaticamente o projeto. A escalação ocorre quando a
alternativa executável ultrapassa um limite vigente ou exige uma decisão
expressamente reservada.

O controlador executável está disponível na CLI por `autopilot start`,
`status`, `resume`, `task`, `event`, `decision`, `complete-task`, `complete`,
`dispatch` e `supervisor`. O runtime possui transporte de conselho por
adaptadores OpenCode/Nexus, scheduler compartilhado e watchers persistentes;
cada rota ainda precisa passar por detecção, consentimento e, no caso Nexus,
admissão PUE. Quando a capacidade não está disponível, registra-se uma espera
retomável e observável.

Não é autonomia infinita: autoridade, portões, condições de retomada, orçamento
de contexto e verificação continuam valendo. Para “não pare até concluir”,
`ralph` fornece o loop com verificação de arquiteto. Para N tarefas
independentes, `ultrawork` fornece paralelismo sem a persistência completa. Para
workers duráveis em tmux, `team`/`worker` continuam disponíveis. `ralplan` só
planeja (`plan --consensus`).
