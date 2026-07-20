# Como Adicionar Uma Skill Canônica

Use este guia para criar ou revisar uma skill canônica do Orquestrador.

## Fluxo

1. Confirme que a skill resolve uma dor recorrente e não duplica uma skill existente.
2. Crie `orquestrador/skills/<skill-name>/SKILL.md`.
3. Espelhe para `codex/skills/<skill-name>/SKILL.md` quando `mirrorEverywhere` for `true`.
4. Atualize:
   - `orquestrador/SKILLS_MANIFEST.json`;
   - `orquestrador/SKILLS_ROUTER.json`;
   - `orquestrador/SKILL_ALIASES.json`, quando houver aliases;
   - `orquestrador/SKILL_CHAINS.json`, quando houver encadeamento;
   - `docs/skill-catalog.md`.
5. Rode `node scripts/skill-catalog.js validate --check-sync`.
6. Rode `npm run validate -- --check-sync`.

## Estrutura Recomendada

```text
Core Workflow
Guardrails
Verification
Related Skills
```

Use nomes equivalentes somente quando fizer sentido, por exemplo `Validation`, `Done Criteria`, `Hard Stops` ou `Policy`.

## Checklist

- Nome segue `skill-<lowercase-hyphen-name>`.
- Descrição é acionável e específica.
- `priorityScore` está entre 1 e 5.
- Triggers são específicas o bastante para não sequestrar tarefas genéricas.
- Skills de risco médio/alto têm guardrails explícitos.
- A verificação diz o que comprova conclusão.
- Chains têm razões para cada `mayInvoke`.
- Nenhum segredo, caminho privado, log, cache ou dado pessoal aparece na skill.

## Exemplo Ruim

```markdown
# skill-helper

Ajuda com tarefas gerais.
```

Problemas: genérica, sem escopo, sem guardrails, sem verificação e sem roteamento claro.

## Exemplo Bom

```markdown
# Skill Quality Review

## Core Workflow

1. Leia skill, manifesto, router, aliases, chains e catálogo.
2. Confirme escopo, gatilhos e risco.

## Guardrails

- Não aprove skills sem verificação.

## Verification

- Rode `node scripts/skill-catalog.js validate --check-sync`.

## Related Skills

- `skill-multiagent-orchestration`
```
