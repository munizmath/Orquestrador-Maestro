# Plano Arquitetural Multi-PR Por Conselho

Status: local-only.

Este plano reorganiza a evolução arquitetural do Orquestrador-Maestro em PRs
curtos, auditáveis e seguros. Ele substitui a ordem orientada por features
visíveis por uma ordem orientada por contratos, políticas, eventos e adapters.

## Conselho De 5 Agentes

- Plataforma: define boundaries, camadas, dependências e contratos internos.
- Integrações: define webhooks, LLMs, n8n, WhatsApp, mocks, dry-run e
  idempotência.
- Segurança: define classificação, redaction, local-only, package safety e
  bloqueios por padrão.
- Produto Operacional: define UX CLI, painel, status, alertas, métricas e
  view models.
- Qualidade: define harness de testes, snapshots, migrações, DoD e
  compatibilidade.

Regra do conselho: nenhum PR funcional pode avançar se ainda faltar o contrato,
o teste e o gate de segurança da camada anterior.

## Princípios Arquiteturais

- Contratos antes de implementação.
- Policies antes de persistência.
- Eventos sanitizados antes de métricas.
- View models antes de API e painel.
- Mocks e dry-run antes de qualquer integração real.
- Config local e segredos sempre fora do Git.
- Painel somente leitura até existir action contract auditável.
- Integrações reais sempre desligadas por padrão.

## Boundaries Obrigatórios

Permitido:

```text
interfaces/cli   -> application -> core
interfaces/http  -> application -> core
interfaces/panel -> http API/view models
application      -> core + ports
infrastructure   -> core contracts
core             -> dependências padrão e validação pura
```

Proibido:

```text
panel -> .omx
panel -> scripts
api -> .omx diretamente
connectors -> cli
llm provider -> run store diretamente
queue -> whatsapp diretamente
core -> infrastructure
```

## PR 0: Consolidar Baseline Atual

Objetivo: fechar o estado já implementado antes de iniciar arquitetura nova.

Sub-PRs:

- PR 0.1: Consolidar mudanças locais já feitas, sem feature nova.
- PR 0.2: Congelar comandos e saídas JSON atuais em fixtures/snapshots leves.
- PR 0.3: Documentar baseline de validação e critérios mínimos de PR.

Validação:

- `npm test`
- `git diff --check`
- `node bin/orquestrador-maestro.js validate --check-sync`
- `node bin/orquestrador-maestro.js health local`
- `npm run package:check`

## PR 1: Fundação De Segurança E Classificação

Objetivo: impedir que estado local, logs, prompts, payloads ou integrações
nasçam sem classificação e redaction.

Sub-PRs:

- PR 1.1: Criar security policy core com classificações `public-safe`,
  `local-only`, `pii`, `secret`, `external-send`, `audit-safe` e `unknown`.
- PR 1.2: Criar redaction engine mínimo para paths locais, tokens, URLs com
  segredo, emails, telefones, payloads grandes e `.env`.
- PR 1.3: Unificar scanner de secrets/PII para validação pública, package check
  e runtime redaction.
- PR 1.4: Centralizar private path boundaries para `.local`, `.omx`, `DEV`,
  logs, backups, caches e runs.

Gates:

- Dados `unknown` bloqueiam egress externo.
- `secret` nunca é persistido nem exposto.
- `local-only` nunca entra em pacote/publicação.

## PR 2: Contratos Canônicos E Test Harness

Status local: implementado parcialmente como fundação executável.

Objetivo: criar linguagem comum antes de runtime, API, painel, LLMs e
connectors.

Sub-PRs:

- PR 2.1: Definir schemas versionados para `RunRecord`,
  `ValidationResult`, `OperationalIssue`, `SkillRouteResult`,
  `ConnectorDescriptor`, `ProviderDescriptor`, `IntegrationIntent`,
  `DryRunResult`, `AuditEvent` e `Task`.
- PR 2.2: Criar helpers de validação de schema com fixtures seguras.
- PR 2.3: Criar harness de teste CLI para `stdout`, `stderr`, exit code e
  JSON parseável.
- PR 2.4: Padronizar envelope JSON CLI: `ok`, `command`, `timestamp`,
  `durationMs`, `data`, `issues`, `warnings`.

Gates:

- Todo schema tem `schemaVersion`.
- Fixtures não usam tokens, caminhos reais, telefones reais ou payload sensível.
- Comandos novos têm teste de `--json`, help, erro e exit code.

Implementado localmente:

- `src/core/schemas.js`
- `scripts/cli-test-harness.js`
- `tests/fixtures/schemas/`
- testes de envelope JSON para `local migrate` e `runs`.

## PR 3: Ports, Policies E Eventos Auditáveis

Status local: implementado parcialmente como fundação executável.

Objetivo: separar domínio, aplicação, storage e adapters antes de gravar estado.

Sub-PRs:

- PR 3.1: Criar ports internos para `RunStore`, `EventStore`,
  `TaskQueueStore`, `PolicyEngine`, `AuditSink`, `ConnectorRegistry` e
  `ProviderRegistry`.
- PR 3.2: Criar policy engine para `local-only`, `dry-run-required`,
  `redact-before-persist`, `consent-required`, `idempotency-required` e
  `external-confirmation-required`.
- PR 3.3: Criar schema de eventos sanitizados: `command.started`,
  `command.finished`, `validation.completed`, `policy.blocked`,
  `intent.created`, `dry_run.generated`, `job.enqueued`, `job.failed`.
- PR 3.4: Criar testes de dependência proibindo imports de infrastructure no
  core e acesso direto do painel/storage.

Gates:

- Eventos rejeitam `rawPayload` por padrão.
- Todo evento tem classificação e payload redigido.
- Policy deny gera evento auditável.

Implementado localmente:

- `src/core/ports.js`
- `src/core/contracts.md`
- `src/core/policies.js`
- `src/core/events.js`
- teste de boundary impedindo imports de infrastructure/application no core.

## PR 4: Storage Local, Migração E Audit Log

Status local: implementado parcialmente como fundação executável.

Objetivo: persistir estado local como detalhe de infraestrutura versionado,
sanitizado e migrável.

Sub-PRs:

- PR 4.1: Criar local store abstraction com `readJson`, `writeJsonAtomic`,
  `listJson`, `ensureDir` e sanitização de paths para output.
- PR 4.2: Criar migration engine mínimo por `schemaVersion` com
  `local migrate --dry-run` e `local migrate --apply`.
- PR 4.3: Criar append-only audit log local em `.omx/audit` com writer em
  memória para testes.
- PR 4.4: Criar run registry sobre audit log, com `runs list`, `runs show` e
  export JSON sanitizado.

Gates:

- `.omx` permanece ignorado pelo Git e fora do pacote.
- `--dry-run` nunca altera disco.
- Comando/stdout/stderr bruto não é salvo por padrão.

Implementado localmente:

- `src/infrastructure/local-store.js`
- `src/infrastructure/migrations.js`
- `src/application/audit-log.js`
- `src/application/run-registry.js`
- CLI `local migrate --dry-run|--apply`
- CLI `runs list|show`

## PR 5: Application Services E View Models

Status local: implementado como primeira versão executável.

Objetivo: criar read models compartilhados por CLI, API e painel.

Sub-PRs:

- PR 5.1: Extrair serviços de validação e skills: `validateProject`,
  `validateSkills`, `listSkills`, `scorePrompt`, `checkSync`.
- PR 5.2: Criar view model de health com validação pública, skills, sync,
  package safety, local-only e registry.
- PR 5.3: Criar view model de skills com prioridade, risco, readiness,
  guardrails, chains e última validação.
- PR 5.4: Criar view models de runs, alertas e operational issues.

Gates:

- CLI, API e painel não duplicam lógica.
- View models não expõem dados crus.
- Estado vazio e estado corrompido têm saída estável.

Implementado localmente:

- `src/application/skill-service.js`
- `src/application/validation-service.js`
- `src/application/view-models.js`

## PR 6: CLI Operacional

Status local: implementado como primeira versão executável.

Objetivo: tornar o orquestrador utilizável e auditável sem painel.

Sub-PRs:

- PR 6.1: Adicionar `orquestrador-maestro status`.
- PR 6.2: Adicionar `orquestrador-maestro doctor`.
- PR 6.3: Completar `orquestrador-maestro runs list/show/prune`.
- PR 6.4: Adicionar `orquestrador-maestro insights`.

Gates:

- Saída humana é curta e acionável.
- `--json` segue envelope comum.
- Erros mostram causa provável e próximo comando recomendado.

Implementado localmente:

- CLI `status`
- CLI `doctor`
- CLI `insights`
- CLI `runs list|show`

## PR 7: API Local Read-Only

Status local: implementado como primeira versão executável.

Objetivo: expor os mesmos read models da CLI por API local segura.

Sub-PRs:

- PR 7.1: Criar servidor local mínimo com `GET /health` e `GET /version`.
- PR 7.2: Adicionar endpoints `GET /status`, `GET /skills`, `GET /runs`,
  `GET /runs/:id`, `GET /alerts`.
- PR 7.3: Aplicar baseline de segurança: bind em `127.0.0.1`, CORS restrito,
  limite de payload, erros sem stack trace e sem serving de diretórios.
- PR 7.4: Adicionar comandos de lifecycle da API em modo foreground primeiro.

Gates:

- API não lê `.omx` diretamente.
- API reutiliza application services/view models.
- Respostas não contêm caminhos privados nem payload sensível.

Implementado localmente:

- `src/interfaces/http/server.js`
- endpoints `GET /health`, `/version`, `/status`, `/skills`, `/runs`,
  `/runs/:id`, `/alerts`, `/insights`, `/integrations`, `/llm/providers`
- CLI `server start`

## PR 8: Painel Local Somente Leitura

Status local: implementado como primeira versão executável.

Objetivo: criar acompanhamento visual sem ações e sem lógica de domínio.

Sub-PRs:

- PR 8.1: Criar shell do painel local-only com navegação: status, skills,
  runs, alertas, integrações.
- PR 8.2: Criar tela de status com prontidão, riscos e próximo comando.
- PR 8.3: Criar tela de runs e validações com filtros básicos.
- PR 8.4: Criar tela de skills com prioridade, guardrails, chains e readiness.
- PR 8.5: Criar tela de alertas com severidade e comando sugerido.

Gates:

- Painel consome API/view models, nunca arquivos.
- Sem analytics externo, CDN externa ou telemetria.
- Sem botões de ação externa.

Implementado localmente:

- `src/interfaces/panel/index.html`
- `src/interfaces/panel/panel.css`
- `src/interfaces/panel/panel.js`
- CLI `panel path`

## PR 9: Contratos De Integração, Dry-Run E Idempotência

Status local: implementado como primeira versão executável.

Objetivo: preparar integrações genéricas sem rede real.

Sub-PRs:

- PR 9.1: Criar `IntegrationIntent`, `IntegrationAction`,
  `IntegrationResult`, `IntegrationError`, `RateLimitPolicy`,
  `RetryPolicy` e `IdempotencyKey`.
- PR 9.2: Criar integration config schema com ambientes `mock`, `dry-run`,
  `live-disabled` e `live`.
- PR 9.3: Criar capability registry para `message.preview`, `message.send`,
  `webhook.emit`, `llm.complete`, `workflow.trigger` e `workflow.status`.
- PR 9.4: Criar dry-run engine e payload preview redigido.
- PR 9.5: Criar idempotency key builder e human confirmation contract.

Gates:

- Sem HTTP real.
- Sem credenciais.
- Todo `execute` exige `dryRun` anterior e policy allow.

Implementado localmente:

- `src/application/integration-service.js`
- CLI `integrations capabilities`
- CLI `integrations dry-run`
- idempotency key determinística a partir de payload redigido

## PR 10: LLM Gateway Mockado

Status local: implementado como primeira versão executável.

Objetivo: preparar LLMs como providers substituíveis, sem vendor lock-in.

Sub-PRs:

- PR 10.1: Criar `LLMProvider` contract e provider registry.
- PR 10.2: Criar request envelope com messages, tools, response format,
  budget, trace mode e redaction policy.
- PR 10.3: Criar provider mock determinístico com timeout, rate limit e JSON
  inválido simulados.
- PR 10.4: Criar LLM data egress policy para bloquear `secret`, `pii` e
  `unknown`.
- PR 10.5: Criar CLI `llm providers`, `llm check` e `llm explain-routing`.

Gates:

- Nenhum SDK real.
- Nenhuma API key.
- Prompt bruto nunca entra no audit trail.

Implementado localmente:

- `src/application/llm-service.js`
- provider `mock-llm`
- CLI `llm providers`
- CLI `llm check`
- CLI `llm explain-routing`

## PR 11: Connector Framework E Webhook Mock

Status local: implementado como primeira versão executável.

Objetivo: criar base comum para sistemas externos antes de n8n/WhatsApp real.

Sub-PRs:

- PR 11.1: Criar connector descriptor com permissões explícitas: `read`,
  `write`, `network`, `webhook`, `filesystem`, `external-send`.
- PR 11.2: Criar connector registry e connector fake.
- PR 11.3: Criar connector config local ignorada pelo Git.
- PR 11.4: Criar webhook mock connector sem rede externa.
- PR 11.5: Criar webhook signature e receiver contract com replay protection.

Gates:

- Default deny.
- Connector sem permissões declaradas falha.
- Config com secret literal falha.

Implementado localmente:

- `src/application/connector-service.js`
- connector `mock-webhook`
- CLI `connectors list|check|dry-run`
- API `GET /connectors`

## PR 12: Workflow/n8n E Message Channel Mockados

Status local: implementado como primeira versão executável.

Objetivo: modelar n8n e WhatsApp como adapters de contratos genéricos.

Sub-PRs:

- PR 12.1: Criar workflow connector contract para `workflow.list`,
  `workflow.trigger`, `workflow.status`, `workflow.cancel` e dry-run.
- PR 12.2: Criar n8n mock connector.
- PR 12.3: Criar workflow payload mapper com idempotency key e payload
  redigido.
- PR 12.4: Criar message channel contract com consentimento obrigatório.
- PR 12.5: Criar WhatsApp mock connector com simulação de número inválido,
  ausência de consentimento e rate limit.
- PR 12.6: Criar bridge WhatsApp/n8n dry-run sem envio real.

Gates:

- Sem `send` real.
- Sem número real em fixtures.
- Consentimento e idempotência são obrigatórios.

Implementado localmente:

- `src/application/workflow-service.js`
- `src/application/message-service.js`
- connectors `mock-n8n` e `mock-message-channel`
- CLI `workflows list|dry-run`
- CLI `messages preview`
- API `GET /workflows`

## PR 13: Queue Local Controlada

Status local: implementado como primeira versão executável.

Objetivo: permitir execução local controlada sem virar shell arbitrário.

Sub-PRs:

- PR 13.1: Criar queue contract e estados `pending`, `blocked`, `ready`,
  `running`, `retrying`, `succeeded`, `failed`, `cancelled`.
- PR 13.2: Criar queue store local versionado.
- PR 13.3: Criar rate limit policy engine.
- PR 13.4: Criar retry/backoff policy com classificação de erro.
- PR 13.5: Criar executor local apenas para comandos allowlisted.

Gates:

- Sem shell arbitrário.
- Toda transição gera audit event.
- Timeout obrigatório.

Implementado localmente:

- `src/application/queue-service.js`
- allowlist inicial: `validate`, `health`
- CLI `queue list|enqueue|run|cancel`
- API `GET /queue`

## PR 14: Métricas E Observabilidade

Status local: implementado como primeira versão executável.

Objetivo: gerar analytics apenas a partir de eventos sanitizados.

Sub-PRs:

- PR 14.1: Criar agregador de métricas de runs, validações e duração.
- PR 14.2: Criar métricas de uso de skills e chains.
- PR 14.3: Criar métricas de connectors e dry-runs.
- PR 14.4: Expor métricas na CLI e API.
- PR 14.5: Mostrar métricas no painel.
- PR 14.6: Criar retention e purge com dry-run obrigatório.

Gates:

- Métricas não leem payload cru.
- Agregados não expõem prompt, telefone, caminho local ou segredo.
- Purge real exige dry-run anterior.

Implementado localmente:

- `src/application/metrics-service.js`
- CLI `metrics summary|retention|purge`
- API `GET /metrics`
- painel mostra métricas agregadas

## PR 15: Adaptadores Reais Atrás De Feature Flag

Status local: implementado como primeira versão bloqueada por padrão.

Objetivo: só permitir integração real depois de contrato, mock, dry-run,
idempotência, auditoria e policies.

Sub-PRs:

- PR 15.1: Criar external HTTP client único com timeout, retry controlado,
  headers redigidos e logging sanitizado.
- PR 15.2: Criar webhook live adapter desligado por padrão.
- PR 15.3: Criar n8n live adapter desligado por padrão.
- PR 15.4: Criar LLM provider real desligado por padrão.
- PR 15.5: Criar WhatsApp live adapter desligado por padrão.

Gates:

- `dry-run` é default.
- `--confirm-external` obrigatório.
- Config local ignorada pelo Git obrigatória.
- Audit trail obrigatório.
- Sem config, falha com mensagem segura.

Implementado localmente:

- `src/application/live-adapters.js`
- adapters live existem apenas como stubs bloqueados
- CLI `adapters live`
- API `GET /adapters/live`

## PR 16: Adapter Runtime Core

Status local: implementado como primeira versão executável.

Objetivo: substituir a lógica dispersa de mocks/live-disabled por um runtime
único de adapters, antes de qualquer adapter real.

Sub-PRs:

- PR 16.1: Criar `AdapterDescriptor`, `Capability`, `AdapterState` e
  `AdapterMode`.
- PR 16.2: Criar `AdapterLifecycle` com `configure`, `check`, `plan`,
  `dryRun` e `execute`.
- PR 16.3: Criar `AdapterRegistry` como fonte única para mocks, dry-run,
  live-disabled e live-ready.
- PR 16.4: Migrar `connector-service`, `workflow-service`, `message-service`,
  `llm-service` e `live-adapters` para usar o runtime comum.

Gates:

- Nenhum adapter chama rede diretamente.
- `execute` não existe sem `plan` e `dryRun`.
- Todo adapter declara capabilities, permissions e mode.
- Mocks continuam sendo default em testes.

Implementado localmente:

- `src/core/adapter-runtime.js`
- `connector-service` migrado para `AdapterLifecycle`
- estados `mock`, `live-disabled` e `live-ready`

## PR 17: Config E Secret Boundary

Status local: implementado como primeira versão executável.

Objetivo: criar uma fronteira versionada para configuração local e segredos,
sem permitir segredo em arquivos rastreados.

Sub-PRs:

- PR 17.1: Criar schema versionado de config local para adapters.
- PR 17.2: Criar `ConfigLoader` que lê apenas `.local`/env vars e mascara
  valores na saída.
- PR 17.3: Criar comandos `config validate`, `config explain` e
  `config example`.
- PR 17.4: Integrar config boundary ao package/public validation.

Gates:

- Config com segredo literal falha.
- Config fora de `.local` falha.
- Saída JSON nunca revela env var value.
- Config tem `schemaVersion`.

Implementado localmente:

- `src/infrastructure/config-loader.js`
- CLI `config validate|explain|example`
- API `GET /config`

## PR 18: Transport Layer Único

Status local: implementado como primeira versão executável.

Objetivo: impedir que adapters implementem HTTP/retry/logging por conta própria.

Sub-PRs:

- PR 18.1: Criar `src/infrastructure/http-client.js` com timeout obrigatório,
  user-agent fixo e respostas normalizadas.
- PR 18.2: Adicionar retry/backoff controlado por policy.
- PR 18.3: Adicionar redaction de headers, URL, query string, request e
  response.
- PR 18.4: Adicionar allowlist/egress guard de host por adapter/config.

Gates:

- Testes usam servidor local mock.
- Timeout é obrigatório.
- Headers sensíveis são redigidos.
- Nenhum teste chama rede externa.

Implementado localmente:

- `src/infrastructure/http-client.js`
- allowlist de host
- redaction de request/response

## PR 19: Policy And Egress Gate Transversal

Status local: implementado como primeira versão executável.

Objetivo: garantir que todo adapter real passe pelos mesmos gates antes de
qualquer saída externa.

Sub-PRs:

- PR 19.1: Expandir policy engine para `egress`, `budget`, `rate-limit`,
  `consent`, `idempotency`, `dry-run`, `confirmation` e `classification`.
- PR 19.2: Criar `EgressDecision` auditável antes de qualquer chamada externa.
- PR 19.3: Integrar policy gate ao `AdapterLifecycle.execute`.
- PR 19.4: Criar testes bloqueando `secret`, `unknown`, ausência de dry-run,
  ausência de idempotência e ausência de confirmação.

Gates:

- `secret` nunca sai.
- `unknown` bloqueia egress.
- External action exige dry-run salvo.
- External action exige confirmação explícita.
- Todo bloqueio gera audit event.

Implementado localmente:

- `src/application/egress-service.js`
- policy expandida para budget/rate-limit
- bloqueios de egress geram evento auditável

## PR 20: Webhook Adapter Live

Status local: implementado como lifecycle real bloqueado por padrão.

Objetivo: resolver `live-webhook-disabled` como adapter real, ainda protegido
por runtime, config, transport e policy.

Sub-PRs:

- PR 20.1: Implementar `webhook.check` sem POST.
- PR 20.2: Implementar `webhook.plan` e `webhook.dryRun` com payload redigido.
- PR 20.3: Implementar `webhook.execute` atrás de `--confirm-external`.
- PR 20.4: Registrar audit trail de check, dry-run, policy deny e execute.

Gates:

- Sem config local, adapter fica `live-disabled`.
- Dry-run é default.
- Idempotency key é obrigatória.
- Payload cru não entra no audit log.

Implementado localmente:

- adapter `live-webhook`
- lifecycle `check`, `plan`, `dryRun`, `execute`
- execute exige config, dry-run, idempotência e confirmação
- CLI `webhook check|dry-run|send`
- teste com servidor HTTP local e bloqueio sem confirmação

## PR 21: Workflow/n8n Adapter Live

Status local: implementado como lifecycle real bloqueado por padrão.

Objetivo: resolver `live-n8n-disabled` como workflow adapter real sem acoplar
n8n ao core.

Sub-PRs:

- PR 21.1: Implementar `n8n.check` validando config e endpoint.
- PR 21.2: Implementar `n8n.workflow.plan` e payload mapper versionado.
- PR 21.3: Implementar `n8n.workflow.dryRun` com idempotency key.
- PR 21.4: Implementar `n8n.workflow.execute` atrás de
  `--confirm-external`.

Gates:

- n8n é apenas infrastructure adapter.
- Workflow payload é redigido antes de persistir.
- Retry só para erro transitório/rate limit.
- Execução real exige config local e confirmação.

Implementado localmente:

- adapter `live-n8n`
- lifecycle `check`, `plan`, `dryRun`, `execute`
- n8n segue `AdapterLifecycle`, não core
- CLI `n8n check|dry-run|trigger`
- teste com servidor HTTP local e bloqueio sem confirmação

## PR 22: Message Channel Boundary

Status local: implementado como primeira versão executável.

Objetivo: separar canal de mensagem genérico de WhatsApp, para evitar
acoplamento direto a fornecedor.

Sub-PRs:

- PR 22.1: Criar `MessageChannel` contract com `preview`, `dryRun`,
  `execute`, `status`.
- PR 22.2: Normalizar `recipientRef`, `templateId`, `locale`, `consent`,
  `windowPolicy` e `idempotencyKey`.
- PR 22.3: Criar policy de consentimento e janela de envio.
- PR 22.4: Migrar `mock-message-channel` para o novo contrato.

Gates:

- Número bruto nunca aparece em logs, API, painel ou fixtures.
- Sem consentimento, bloqueia.
- Sem idempotência, bloqueia.
- Template obrigatório quando a janela exigir.

Implementado localmente:

- `src/application/message-service.js`
- `mock-message-channel`
- recipient sempre vira `recipientRef`

## PR 23: WhatsApp Adapter Live

Status local: implementado como lifecycle real bloqueado por padrão.

Objetivo: resolver `live-whatsapp-disabled` como implementation de
`MessageChannel`, não como lógica especial.

Sub-PRs:

- PR 23.1: Implementar `whatsapp.check` com token por env var e phone id
  mascarado.
- PR 23.2: Implementar `whatsapp.preview` com payload redigido.
- PR 23.3: Implementar `whatsapp.dryRun` validando consentimento, template,
  rate limit e idempotência.
- PR 23.4: Implementar `whatsapp.execute` atrás de `--confirm-external`.

Gates:

- Consentimento explícito obrigatório.
- Rate limit por destinatário/canal.
- Audit trail sem número/mensagem bruta.
- Retries só para erros transitórios.

Implementado localmente:

- adapter `live-whatsapp`
- lifecycle `check`, `preview/dryRun`, `execute`
- consentimento e confirmação exigidos por policy
- CLI `whatsapp check|dry-run|send`
- teste com servidor HTTP local, consentimento obrigatório e bloqueio sem consentimento

## PR 24: LLM Provider Live

Status local: implementado como lifecycle real bloqueado por padrão.

Objetivo: resolver o gateway LLM real como provider substituível, sem
vendor lock-in e sem prompt bruto em auditoria.

Sub-PRs:

- PR 24.1: Criar `LLMProvider` adapter runtime em cima do lifecycle comum.
- PR 24.2: Implementar `llm.check` por provider configurado.
- PR 24.3: Implementar `llm.plan` e `llm.dryRun` com budget, modelo e
  prompt redigido/hash.
- PR 24.4: Implementar `llm.complete` atrás de `--confirm-external`.

Gates:

- Provider real exige env/config local.
- `secret` bloqueia.
- `pii` redige ou bloqueia conforme policy.
- Budget obrigatório.
- Timeout obrigatório.
- Mock continua default em testes.

Implementado localmente:

- adapter `live-llm`
- provider `live-llm` aparece como `live-disabled`
- mock continua default e sucesso em testes
- CLI `llm live-check|dry-run|complete`
- teste com servidor HTTP local e bloqueio sem dry-run

## PR 25: Queue Executando AdapterIntent

Status local: implementado como primeira versão segura.

Objetivo: fazer a queue executar intenções de adapter, não comandos soltos nem
integrações diretas.

Sub-PRs:

- PR 25.1: Criar `AdapterIntent` e `ExecutionPlan` versionados.
- PR 25.2: Adicionar task types allowlisted: `webhook.emit`,
  `n8n.workflow.trigger`, `message.send` e `llm.complete`.
- PR 25.3: Exigir dry-run salvo, idempotency key, policy allow e confirmação
  para tasks externas.
- PR 25.4: Registrar transições como audit events sanitizados.

Gates:

- API não enfileira execução real no primeiro PR.
- CLI exige `--confirm-external`.
- Queue não chama WhatsApp/n8n/LLM diretamente; chama adapter runtime.

Implementado localmente:

- queue aceita task types `webhook.emit`, `n8n.workflow.trigger`,
  `message.send`, `llm.complete`
- tasks de adapter exigem dry-run salvo e idempotency key

## PR 26: Painel Com Ações Seguras

Status local: implementado como read model sem execução live.

Objetivo: permitir ações de baixo risco no painel sem liberar envio real.

Sub-PRs:

- PR 26.1: Criar `ActionContract` com `riskLevel`, `dryRun`,
  `requiresConfirmation`, `auditEvent` e `rollbackHint`.
- PR 26.2: Adicionar ações de check e dry-run para adapters.
- PR 26.3: Exibir payload preview redigido.
- PR 26.4: Registrar histórico de ações no run registry/audit log.

Gates:

- Painel não executa live no primeiro PR.
- Ações externas só aparecem como dry-run/check.
- Todo clique que muda estado gera audit event.

Implementado localmente:

- `src/application/action-service.js`
- API `GET /actions`
- painel mostra ações, mas execução live fica desabilitada

## PR 27: Mocks Como Test Adapters, Não Default Único

Status local: implementado como primeira matriz de estados.

Objetivo: manter mocks como camada de teste e desenvolvimento, enquanto
adapters live ficam disponíveis apenas quando configurados.

Sub-PRs:

- PR 27.1: Adicionar estados `mock`, `configured`, `live-disabled`,
  `live-ready`, `blocked`.
- PR 27.2: Atualizar CLI/API/painel para mostrar estado real do adapter.
- PR 27.3: Garantir que CI/testes continuam usando mocks por padrão.
- PR 27.4: Documentar matriz de readiness por adapter.

Gates:

- Live nunca roda em teste sem config explícita.
- Mock não mascara falha de config live.
- Painel diferencia mock, disabled e ready.

Implementado localmente:

- connectors expõem `mode`, `configured`, `healthy`, `liveDisabledByDefault`
- mocks continuam default
- live adapters ficam visíveis e bloqueados por config/policy

## Critérios Globais De Pronto

Todo sub-PR deve cumprir:

- `npm test`
- `git diff --check`
- `node bin/orquestrador-maestro.js validate --check-sync`
- `node bin/orquestrador-maestro.js health local`
- `npm run package:check` quando mexer em empacotamento, docs públicas ou
  paths privados.
- Testes de `--json`, help, erro e exit code quando adicionar CLI.
- `schemaVersion` e migração quando adicionar persistência.
- Mock/dry-run antes de qualquer integração externa.
- Snapshot normalizando timestamp, path, id e duração.
- Nenhum dado privado, segredo, caminho real, telefone real, prompt bruto ou
  payload sensível em fixtures ou docs públicas.

## Ordem Consolidada

1. Consolidar baseline atual.
2. Criar segurança, classificação e redaction.
3. Criar schemas, contratos e harness CLI.
4. Criar ports, policies e eventos auditáveis.
5. Criar storage local, migração, audit log e run registry.
6. Criar application services e view models.
7. Criar CLI operacional.
8. Criar API local read-only.
9. Criar painel local somente leitura.
10. Criar integração genérica com dry-run/idempotência.
11. Criar LLM gateway mockado.
12. Criar connector framework e webhook mock.
13. Criar workflow/n8n e message channel mockados.
14. Criar queue local controlada.
15. Criar métricas e retenção.
16. Criar adaptadores reais desligados por padrão.
17. Criar adapter runtime core.
18. Criar config e secret boundary.
19. Criar transport layer único.
20. Criar policy and egress gate transversal.
21. Resolver webhook live.
22. Resolver workflow/n8n live.
23. Criar message channel boundary.
24. Resolver WhatsApp live.
25. Resolver LLM provider live.
26. Fazer queue executar AdapterIntent.
27. Adicionar ações seguras ao painel.
28. Manter mocks como test adapters, não default único.
29. Criar `setup local` para instalação, sync, health e diagnóstico.
30. Criar testes live opt-in para sandboxes WhatsApp/LLM.
31. Consolidar painel operacional com readiness, runs, fila, métricas e audit
    log em uma tela.
