# Autopilot runtime

O Autopilot possui um controlador de missão executável no runtime do Maestro.
Ele persiste a missão em uma única árvore, sem subpastas por tarefa ou domínio:

```text
.omx/autopilot/
├── checkpoint.md
├── boundaries.md
├── tasks.md
├── validation.md
└── survival-guide.md
```

## Comandos

Iniciar e consultar uma missão:

```text
orquestrador-maestro autopilot start --project-path PATH "objetivo"
orquestrador-maestro autopilot status --project-path PATH --json
orquestrador-maestro autopilot resume --project-path PATH --json
orquestrador-maestro autopilot supervisor once --project-path PATH --json
orquestrador-maestro autopilot supervisor run --provider opencode --allow-cloud-context --interval-ms 10000
```

Para a rota Nexus, use `--provider nexus --execution-unit '{"executionId":"...","nexusProjectId":"...","provider":"..."}'`, além dos limites PUE e do consentimento aplicáveis.

Adicionar uma lane e registrar eventos do adaptador:

```text
orquestrador-maestro autopilot task add --project-path PATH \
  --id TASK-01 --description "Implementar endpoint"
orquestrador-maestro autopilot event --project-path PATH \
  --event-type execution.completed --task-id TASK-01 --result-ref RESULT-01
```

Uma tarefa concluída por evento ainda precisa de verificação. Para concluir uma
tarefa, use `complete-task`; para concluir a missão, use `complete` depois que
as tarefas e gates aplicáveis estiverem satisfeitos.

O supervisor pode ser executado como processo de serviço do Maestro. Ele lê os
watchers persistidos, reavalia capacidade e rotas de conselho, reconcilia a
tarefa afetada e, quando `--provider` foi configurado, despacha a próxima lane
pronta pelo adaptador de execução e incorpora seu evento de resultado. Sem
`--provider`, o processo permanece em modo de observação e recuperação de
estado; não inventa um executor. `once` é adequado para um scheduler externo;
`run` mantém a observação em loop.

## Contratos executáveis

- O `RunStore` mantém leases de controle por projeto com época crescente e
  fencing verificado no ponto de escrita protegido.
- O scheduler compartilhado persiste alocações no `RunStore` global e considera
  lanes prontas, capacidade global e pools compartilhados; `min_agents`,
  `preferred_agents` e `max_agents` são limites da solicitação. Uma nova
  concessão expira se o processo que a recebeu desaparecer.
- Um evento `execution.failed` cria um blocker e convoca o conselho configurado.
  O `ProviderCouncilAdapter` pode consultar rotas reais do OpenCode em paralelo
  e aceita unidades Nexus somente pelo contrato `dispatchUnit` já admitido pelo
  PUE. Sem rota saudável ou autorização aplicável, a missão registra uma
  condição de espera observável; não declara que o problema foi resolvido.
  Consultas OpenCode recebem um workspace efêmero com o contexto sanitizado da
  missão; o conselho não recebe permissão para editar o workspace do produto.
- Eventos são deduplicados por `source` e `event_id`. Resultado não correlacionável
  permanece desconhecido até reconciliação.
- A continuação automática usa o mesmo contrato de adaptador da CLI: OpenCode
  passa por `executeTaskWithHandoff`; Nexus exige uma unidade PUE em
  `--execution-unit` e passa por `dispatchProviderUnit`. Sem esses dados, a
  tarefa permanece pendente com o motivo factual.
- `technical_result` continua separado de `disposition`. Uma entrega com falha
  técnica só pode ser encerrada quando uma decisão ativa registra
  `authorizes_completion: true`.

## Configuração do conselho

Por padrão, a CLI tenta a rota `opencode`. Rotas explícitas podem ser
selecionadas sem alterar o contrato da missão:

```text
orquestrador-maestro autopilot event \
  --project-path PATH --event-type execution.failed --task-id TASK-01 \
  --council-providers opencode --council-agent reviewer
```

Para uma composição mais específica, `--council-routes` recebe uma lista JSON
com `providerId`, `model`, `agent`, `capabilities` e, para Nexus, a referência
da unidade PUE em `unit`. O runtime não transforma a existência de uma skill,
perfil ou sessão em capacidade disponível: cada rota passa por detecção e por
seu próprio gate de consentimento/admissão.

O controlador, os leases, o scheduler compartilhado, o supervisor e o contrato
de eventos estão executáveis e testados. A homologação de uma unidade Nexus
real continua condicionada ao PUE vigente, ao binário compatível e a uma unidade
`READY` da mesma execução; ausência desses fatos permanece um bloqueio factual,
não uma simulação de sucesso.
