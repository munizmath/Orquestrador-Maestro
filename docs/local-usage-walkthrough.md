# Passo A Passo De Uso Local

Status: local-only.

Este guia mostra como usar o Orquestrador-Maestro neste clone local. Nenhum
comando abaixo publica, envia WhatsApp, chama LLM real, dispara n8n real ou
aciona webhook externo por padrão.

## 1. Validar O Projeto

Rode a validação completa:

```bash
npm test
```

Ou valide somente o estado local:

```bash
node bin/orquestrador-maestro.js health local
node bin/orquestrador-maestro.js status
node bin/orquestrador-maestro.js doctor
```

Saída JSON:

```bash
node bin/orquestrador-maestro.js status --json
node bin/orquestrador-maestro.js doctor --json
```

## 1.1. Automatizar Setup Local

```bash
node bin/orquestrador-maestro.js setup local --dry-run --json
node bin/orquestrador-maestro.js setup local
```

O `setup local` executa instalação/sincronização, verificação, validação pública,
health local e diagnóstico. Use `--dry-run` para revisar o plano sem alterar o
home do usuário.

## 2. Inicializar Estado Local

O estado operacional fica em `.omx/state`, ignorado pelo Git.

Ver o plano de migração:

```bash
node bin/orquestrador-maestro.js local migrate --dry-run
```

Aplicar:

```bash
node bin/orquestrador-maestro.js local migrate --apply
```

## 3. Consultar Runs E Métricas

Listar execuções locais:

```bash
node bin/orquestrador-maestro.js runs list
```

Ver uma execução:

```bash
node bin/orquestrador-maestro.js runs show <run_id>
```

Ver métricas agregadas:

```bash
node bin/orquestrador-maestro.js insights
node bin/orquestrador-maestro.js metrics summary
```

Retenção e purge sempre começam em dry-run:

```bash
node bin/orquestrador-maestro.js metrics retention --older-than-days 30
node bin/orquestrador-maestro.js metrics purge --older-than-days 30
```

Aplicar purge:

```bash
node bin/orquestrador-maestro.js metrics purge --older-than-days 30 --apply
```

## 4. Usar A API Local E O Painel

Inicie a API local:

```bash
node bin/orquestrador-maestro.js server start --port 8787
```

Abra no navegador:

```text
http://127.0.0.1:8787/
```

Endpoints úteis:

```text
GET /status
GET /skills
GET /runs
GET /alerts
GET /connectors
GET /workflows
GET /queue
GET /metrics
GET /llm/providers
GET /adapters/live
GET /actions
```

O painel é somente leitura. Ele não executa envio real.

## 5. Ver Config Local

Gerar exemplo de config:

```bash
node bin/orquestrador-maestro.js config example
```

Explicar config atual:

```bash
node bin/orquestrador-maestro.js config explain
```

Validar config:

```bash
node bin/orquestrador-maestro.js config validate
```

Por padrão, se `.local/orquestrador/config.json` não existir, o sistema usa um
exemplo seguro e mantém adapters live bloqueados.

## 6. Usar Connectors Mock

Listar connectors:

```bash
node bin/orquestrador-maestro.js connectors list
```

Checar webhook mock:

```bash
node bin/orquestrador-maestro.js connectors check --id mock-webhook
```

Dry-run de webhook mock:

```bash
node bin/orquestrador-maestro.js connectors dry-run \
  --id mock-webhook \
  --payload-json '{"message":"hello"}' \
  --confirmed
```

Checar adapter live bloqueado:

```bash
node bin/orquestrador-maestro.js connectors check --id live-webhook
```

Esse comando deve retornar `live-disabled` enquanto não houver config local e
confirmação explícita.

## 6.1. Usar Webhook Live Com Segurança

O webhook live é o primeiro adapter real iniciado. Ele só envia HTTP quando
todos estes requisitos são cumpridos:

- config local em `.local/orquestrador/config.json`;
- endpoint vindo de env var;
- host permitido em `allowedHosts`;
- dry-run/idempotência;
- `--confirm-external`;
- `--enable-live-http`.

Crie um exemplo de config:

```bash
node bin/orquestrador-maestro.js config init
```

Configure a env var local, por exemplo:

```bash
export ORQUESTRADOR_WEBHOOK_URL="http://127.0.0.1:8788/hook"
```

Cheque o adapter:

```bash
node bin/orquestrador-maestro.js webhook check
```

Gere um dry-run:

```bash
node bin/orquestrador-maestro.js webhook dry-run \
  --payload-json '{"event":"test"}' \
  --idempotency-key idem_test
```

Envio real exige confirmação explícita:

```bash
node bin/orquestrador-maestro.js webhook send \
  --payload-json '{"event":"test"}' \
  --idempotency-key idem_test \
  --confirm-external \
  --enable-live-http
```

Sem essas flags, o envio fica bloqueado.

## 7. Usar Workflow/n8n Mock

Listar workflows mock:

```bash
node bin/orquestrador-maestro.js workflows list
```

Dry-run de workflow:

```bash
node bin/orquestrador-maestro.js workflows dry-run \
  --workflow-id wf_mock_onboarding \
  --payload-json '{"event":"test"}'
```

Isso não chama n8n real.

## 7.1. Usar n8n Live Com Segurança

O n8n live segue o mesmo modelo do webhook live: fica bloqueado até existir
config local, env var, dry-run, idempotência, confirmação e transporte
explicitamente habilitado.

Configure a env var local:

```bash
export ORQUESTRADOR_N8N_WEBHOOK_URL="http://127.0.0.1:8788/n8n"
```

Cheque o adapter:

```bash
node bin/orquestrador-maestro.js n8n check
```

Gere um dry-run:

```bash
node bin/orquestrador-maestro.js n8n dry-run \
  --workflow-id wf_live_default \
  --payload-json '{"event":"test"}' \
  --idempotency-key idem_n8n_test
```

Disparo real exige confirmação explícita:

```bash
node bin/orquestrador-maestro.js n8n trigger \
  --workflow-id wf_live_default \
  --payload-json '{"event":"test"}' \
  --idempotency-key idem_n8n_test \
  --confirm-external \
  --enable-live-http
```

Sem essas flags, o trigger fica bloqueado.

## 8. Usar Message Channel Mock

Preview de mensagem com consentimento:

```bash
node bin/orquestrador-maestro.js messages preview \
  --recipient placeholder-recipient \
  --body "Mensagem de teste" \
  --consent
```

Sem `--consent`, o fluxo bloqueia. Números reais não devem ser usados em
fixtures ou logs.

## 8.1. Usar WhatsApp Live Com Segurança

O WhatsApp live exige token, phone id, endpoint, consentimento e confirmação
explícita.

Configure env vars locais:

```bash
export ORQUESTRADOR_WHATSAPP_TOKEN="valor-local"
export ORQUESTRADOR_WHATSAPP_PHONE_ID="phone-id-local"
export ORQUESTRADOR_WHATSAPP_API_URL="http://127.0.0.1:8788/whatsapp"
```

Cheque:

```bash
node bin/orquestrador-maestro.js whatsapp check
```

Dry-run:

```bash
node bin/orquestrador-maestro.js whatsapp dry-run \
  --recipient placeholder-recipient \
  --body "Mensagem de teste" \
  --idempotency-key idem_whatsapp_test \
  --consent
```

Envio real exige todas as travas:

```bash
node bin/orquestrador-maestro.js whatsapp send \
  --recipient placeholder-recipient \
  --body "Mensagem de teste" \
  --idempotency-key idem_whatsapp_test \
  --consent \
  --confirm-external \
  --enable-live-http
```

Sem `--consent`, o envio bloqueia.

## 9. Usar LLM Mock

Listar providers:

```bash
node bin/orquestrador-maestro.js llm providers
```

Checar providers:

```bash
node bin/orquestrador-maestro.js llm check
```

Explicar roteamento mock:

```bash
node bin/orquestrador-maestro.js llm explain-routing --prompt "resuma este plano"
```

Provider real aparece como `live-disabled` até existir config local segura.

## 9.1. Usar LLM Live Com Segurança

Configure env vars locais:

```bash
export ORQUESTRADOR_LLM_API_KEY="valor-local"
export ORQUESTRADOR_LLM_API_URL="http://127.0.0.1:8788/llm"
```

Cheque:

```bash
node bin/orquestrador-maestro.js llm live-check
```

Dry-run:

```bash
node bin/orquestrador-maestro.js llm dry-run \
  --prompt "resuma este texto" \
  --budget 1 \
  --idempotency-key idem_llm_test
```

Completion real exige confirmação:

```bash
node bin/orquestrador-maestro.js llm complete \
  --prompt "resuma este texto" \
  --budget 1 \
  --idempotency-key idem_llm_test \
  --confirm-external \
  --enable-live-http
```

O prompt bruto não entra no audit trail; o serviço usa hash e preview redigido.

## 9.2. Testes Live Opt-In Em Sandbox

Os testes reais de sandbox ficam fora do `npm test` e só rodam com variáveis
explícitas:

```bash
ORQUESTRADOR_ENABLE_WHATSAPP_SANDBOX_TESTS=1 \
ORQUESTRADOR_ENABLE_LLM_SANDBOX_TESTS=1 \
npm run test:live-sandbox
```

Para realmente enviar para o endpoint configurado, adicione:

```bash
ORQUESTRADOR_LIVE_SANDBOX_SEND=1 npm run test:live-sandbox
```

Variáveis esperadas:

```bash
ORQUESTRADOR_WHATSAPP_TOKEN
ORQUESTRADOR_WHATSAPP_PHONE_ID
ORQUESTRADOR_WHATSAPP_API_URL
ORQUESTRADOR_WHATSAPP_SANDBOX_RECIPIENT
ORQUESTRADOR_LLM_API_KEY
ORQUESTRADOR_LLM_API_URL
```

Tokens, destinatários e endpoints devem ficar em ambiente local ou `.local/`,
nunca em arquivos rastreados.

## 10. Usar Queue Local

Enfileirar validação local:

```bash
node bin/orquestrador-maestro.js queue enqueue --type validate
```

Listar tarefas:

```bash
node bin/orquestrador-maestro.js queue list
```

Executar tarefa:

```bash
node bin/orquestrador-maestro.js queue run --id <task_id>
```

Cancelar tarefa:

```bash
node bin/orquestrador-maestro.js queue cancel --id <task_id>
```

A queue não executa shell arbitrário. Ela usa allowlist.

## 11. Entender O Que Ainda Está Bloqueado

Ver adapters live:

```bash
node bin/orquestrador-maestro.js adapters live
```

Eles ficam bloqueados por padrão. Para virarem reais, ainda precisam de:

- config local segura;
- env vars;
- dry-run salvo;
- idempotency key;
- consentimento quando aplicável;
- policy allow;
- confirmação explícita;
- transporte HTTP controlado.

## 12. Fluxo Diário Recomendado

```bash
node bin/orquestrador-maestro.js status
node bin/orquestrador-maestro.js health local
node bin/orquestrador-maestro.js connectors list
node bin/orquestrador-maestro.js llm check
node bin/orquestrador-maestro.js metrics summary
```

Para abrir o painel:

```bash
node bin/orquestrador-maestro.js server start --port 8787
```

Depois abra:

```text
http://127.0.0.1:8787/
```
