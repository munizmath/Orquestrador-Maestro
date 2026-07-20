# Plano De Melhorias Do Orquestrador

Este plano registra melhorias possíveis para o Orquestrador-Maestro após a curadoria ROI. Escopo atual: `local-only`, sem publicação, push ou release até decisão explícita.

Status: executado localmente em 2026-05-26.

## Objetivo

Fortalecer validação, governança local, roteamento de skills, experiência CLI, documentação, sanitização e execução multiagente, mantendo o repositório instalável, auditável e seguro.

## Prioridade Recomendada

1. Qualidade e validação.
2. Segurança e sanitização.
3. Skills e roteamento.
4. Experiência CLI.
5. Governança local.
6. Documentação.
7. Multiagentes.

## Onda 1: Qualidade E Validação

### Itens

- Adicionar testes automatizados para `scripts/skill-catalog.js`, especialmente para:
  - skill inválida;
  - skill duplicada;
  - skill sem verificação;
  - skill sem guardrails quando o risco for médio ou alto.
- Criar um `npm test` mínimo que rode:
  - validação pública;
  - validação de skills;
  - testes unitários dos scripts.
- Fazer `scripts/validate-public.ps1` reportar linha e trecho do problema, não só arquivo.
- Adicionar validação de sincronização entre `orquestrador/skills/*` e `codex/skills/*`.

### Critérios De Conclusão

- `npm test` existe e passa localmente.
- Casos inválidos de skills têm fixtures ou testes dedicados.
- Falhas de sanitização indicam arquivo, linha e trecho sanitizado.
- Divergências entre skills canônicas e espelhos Codex são detectadas.

## Onda 2: Governança Local

### Itens

- Criar um modo explícito `local-only` no plano/radar para separar curadoria privada de publicação.
- Adicionar `DEV/CONTEXT.md` e `DEV/WORKLOG.md` locais, ignorados pelo Git, para registrar decisões e próximas execuções.
- Criar comando ou script de health local que rode:
  - `npm run validate`;
  - checagem de arquivos não rastreados suspeitos;
  - confirmação de consistência entre router, manifest e catálogo.

### Critérios De Conclusão

- O modo local-only está documentado e não conflita com validação pública.
- `DEV/` pode ser inicializado sem entrar no Git.
- O health local produz saída curta e acionável.

## Onda 3: Skills E Roteamento

### Itens

- Adicionar score de prioridade/ROI no manifesto das skills para ajudar o roteador.
- Criar uma skill canônica `skill-quality-review` para revisar novas skills antes de entrarem no catálogo.
- Melhorar `SKILL_CHAINS.json` com razões de encadeamento, não só `mayInvoke`.
- Criar testes de roteamento: dado um prompt, quais skills deveriam ser ativadas.

### Critérios De Conclusão

- Manifesto aceita e valida score de ROI/prioridade.
- `skill-quality-review` existe em `orquestrador/skills` e `codex/skills`.
- Chains explicam por que uma skill pode invocar outra.
- Testes de roteamento cobrem prompts frequentes e integrações novas.

## Onda 4: Experiência CLI

### Itens

- Adicionar comandos CLI:
  - `orquestrador-maestro validate`;
  - `orquestrador-maestro skills list`;
  - `orquestrador-maestro skills check`.
- Melhorar mensagens de erro do instalador/verificador quando `node`, `pwsh` ou permissões faltarem.
- Adicionar `--json` em scripts de validação para integração com agentes e ferramentas.

### Critérios De Conclusão

- Comandos CLI rodam a partir do pacote local.
- Erros de dependência indicam causa e ação recomendada.
- Saída JSON é estável o bastante para automação.

## Onda 5: Documentação

### Itens

- Criar guia "Como adicionar uma nova skill canônica".
- Criar guia "Como usar o radar de catálogos externos".
- Separar docs públicas de docs operacionais locais para evitar confusão entre snapshot publicável e uso privado.
- Adicionar exemplos pequenos de antes/depois de uma skill ruim vs skill canônica boa.

### Critérios De Conclusão

- Uma nova skill pode ser criada seguindo apenas o guia.
- O radar tem fluxo claro de avaliação, absorção, rejeição e revisão.
- Docs indicam explicitamente o que é local-only e o que é publicável.

## Onda 6: Segurança E Sanitização

### Itens

- Melhorar o scanner de termos privados para evitar falsos positivos e permitir allowlist explícita.
- Adicionar checagem de arquivos ADS/Windows como `Zone.Identifier`.
- Criar fixtures de validação pública com exemplos seguros e inseguros.
- Validar que nenhum arquivo em `.local`, `.omx`, `DEV`, logs, backups ou caches entra em pacote npm.

### Critérios De Conclusão

- Validador diferencia termos privados reais de substrings inofensivas.
- Arquivos `Zone.Identifier` e downloads parciais são bloqueados.
- Fixtures cobrem segredos, caminhos locais, logs, caches e falsos positivos.
- `npm pack --dry-run` é verificado por script ou teste.

## Onda 7: Multiagentes

### Itens

- Criar templates de handoff para:
  - planner;
  - executor;
  - reviewer;
  - verifier;
  - documentation maintainer.
- Adicionar exemplos de divisão de trabalho por tipo de tarefa:
  - SaaS;
  - segurança;
  - documentação;
  - integração GitHub;
  - WhatsApp/n8n.
- Criar checklist de integração final para o agente líder.

### Critérios De Conclusão

- Templates de handoff são pequenos, copiáveis e específicos por papel.
- Exemplos de divisão indicam ownership, não sobreposição e validação.
- Checklist final cobre integração, conflitos, testes e riscos residuais.

## Verificação Final

Antes de considerar este plano executado:

```bash
npm test
npm run validate
npm pack --dry-run
git diff --check
```

Se `npm test` ainda não existir durante as primeiras ondas, substitua temporariamente por:

```bash
npm run validate
node scripts/skill-catalog.js validate
```

## Resultado Local

- `npm test` criado e executado com sucesso.
- `orquestrador-maestro validate`, `orquestrador-maestro skills list`, `orquestrador-maestro skills check` e `orquestrador-maestro health local` implementados.
- `skill-quality-review` criada e registrada.
- `priorityScore` adicionado ao manifesto.
- `SKILL_CHAINS.json` passou a incluir razões de encadeamento.
- `tests/routing-cases.json` criado.
- `scripts/validate-public.ps1` passou a reportar linha e trecho.
- `scripts/local-health.js` e `scripts/package-check.js` criados.
- `DEV/CONTEXT.md` e `DEV/WORKLOG.md` inicializados localmente e ignorados pelo Git.
