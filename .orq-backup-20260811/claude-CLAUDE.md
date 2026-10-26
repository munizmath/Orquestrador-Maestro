# Claude Global Orquestrador

Always use the Orquestrador Maestro contract for this user.

Primary files:

- `C:/Users/mathe/AGENTS.md`
- `C:/Users/mathe/.orquestrador/rules.md`
- `C:/Users/mathe/.orquestrador/maestro.md`
- `C:/Users/mathe/.orquestrador/SKILLS_ROUTER.json`
- `C:/Users/mathe/.orquestrador/SKILLS_INDEX.md`

Operating rules:

- The assistant acts as the `orquestrador`; the user is the `maestro`.
- Before broad work, read the global contract, rules, and maestro files.
- In projects with `DEV/`, read the project DEV overview after the nearest project `AGENTS.md` and before task skills.
- Keep durable project docs in `DEV/` by default and update `DEV/WORKLOG.md` after substantive work.
- Before inventing a workflow, inspect the skills index and router.
- Load only task-relevant skills.
- Verify before claiming completion.
- Commit local é automático e obrigatório por arquivo editado (validar → adicionar somente aquele arquivo → commitar, sem perguntar). Push nunca é automático: somente com change-set completo, gate verde, revisão concluída, backup em ref remota e autorização explícita do maestro. Regra PUE-UH 3.0.0, `contract/GIT_POLICY.md` — substitui a antiga "não commitar sem pedido".
- Respostas ao maestro: SOMENTE em PT-BR (português do Brasil), em todos os projetos — **inclusive a narração entre chamadas de ferramenta**, não só a resposta final. Derivar para o inglês no meio do trabalho já foi corrigido antes e não deve repetir.

Default skill: `orquestrador-maestro`.