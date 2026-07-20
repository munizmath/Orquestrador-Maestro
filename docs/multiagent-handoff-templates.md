# Templates De Handoff Multiagente

Use estes templates quando uma tarefa for dividida entre agentes. O objetivo é reduzir sobreposição, preservar ownership e facilitar integração final.

## Planner

```text
Lane: planner
Ownership: plano, riscos, critérios de aceitação
Files read:
Files changed: none
Plan:
Acceptance criteria:
Risks:
Suggested verification:
Handoff to:
```

## Executor

```text
Lane: executor
Ownership: arquivos/diretórios atribuídos
Files read:
Files changed:
Implementation summary:
Commands run:
Result:
Blockers:
Residual risk:
Handoff to:
```

## Reviewer

```text
Lane: reviewer
Ownership: revisão do diff integrado
Files reviewed:
Findings by severity:
Missing requirements:
Suggested fixes:
Verdict: APPROVE / COMMENT / REQUEST CHANGES
Residual risk:
```

## Verifier

```text
Lane: verifier
Ownership: evidência de conclusão
Claims checked:
Commands run:
Artifacts inspected:
Verdict: PASS / PARTIAL / FAIL
Gaps:
Residual risk:
```

## Documentation Maintainer

```text
Lane: documentation maintainer
Ownership: docs e notas operacionais atribuídas
Files read:
Files changed:
Behavior documented:
Local-only vs public impact:
Validation:
Handoff to:
```

## Exemplos De Divisão

### SaaS

- Lead: arquitetura, integração e validação final.
- Executor backend: APIs, banco, auth, billing e workers.
- Executor frontend: dashboard, forms, estados e responsividade.
- Security reviewer: RLS, secrets, webhooks e tenancy.
- Verifier: typecheck, build, testes e smoke checks.

### Segurança

- Lead: escopo autorizado e severidade.
- Scanner: ferramentas locais e coleta de evidência.
- Reviewer: confirmação manual de high/critical.
- Documentation maintainer: relatório sanitizado.
- Verifier: comandos e artefatos de saída.

### Documentação

- Lead: estrutura e fonte de verdade.
- Writer: conteúdo novo ou reescrito.
- Reviewer: precisão e links.
- Verifier: validação pública e ausência de dados privados.

### GitHub

- Lead: autorização e operação permitida.
- Researcher: issue, PR, Actions e histórico.
- Reviewer: riscos e comentários.
- Executor: mutação GitHub apenas se autorizada.
- Verifier: re-fetch do estado final.

### WhatsApp/n8n

- Lead: contrato de workflow e consentimento.
- Integration executor: n8n, gateway e filas.
- Security reviewer: segredos, PII, rate limits e logs.
- Verifier: replay de webhook, dedupe e idempotência.

## Checklist Do Líder

- Escopo e ownership foram definidos antes das edições.
- Nenhum agente editou fora da sua lane.
- Arquivos compartilhados foram integrados por uma única pessoa.
- Handoffs incluem arquivos, comandos, resultado e risco.
- O diff integrado foi revisado.
- A validação final foi executada depois da integração.
- Riscos residuais foram comunicados.
