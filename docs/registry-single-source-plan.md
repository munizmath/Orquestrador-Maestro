# Plano: Registro de Skills com Fonte Única (itens 2/3/5)

Objetivo: eliminar duplicação e drift no registro de skills, reduzindo tokens
carregados por sessão e por consulta de chain, sem quebrar o contrato de
validação que todas as ferramentas espelhadas dependem.

Princípio central: **`SKILLS_MANIFEST.json` é a única fonte de verdade.**
`SKILLS_ROUTER.json` e `SKILL_ALIASES.json` passam a ser **artefatos gerados**;
`SKILL_CHAINS.json` fica só com o grafo (`mayInvoke` + `rules`), e o *porquê*
de cada aresta vive na seção "Related Skills" do `SKILL.md` da skill dona
(que o validador **já exige**).

## Impacto medido (honesto)

| Mudança | Onde economiza | ~Tokens |
|---|---|---|
| Item 2 — remover `canonicalPath`/`codexPath` do router (deriváveis) | boot (router é sempre carregado) | ~879 |
| Item 3 — mover `reasons` do chains para os SKILL.md | consulta de chain (deferido, não boot) | ~2.568 |
| Item 5 — gerar router+aliases do manifest | correção: mata o drift (classe de bug que o merge de hoje pegou) | ~modesto |

Item 2 é ganho de boot. Item 3 é ganho quando uma chain é consultada (o arquivo
inteiro é lido para obter uma aresta). Item 5 é ganho de **corretude**, não de tokens.

## Achado que reduz risco

`canonicalPath`, `codexPath` e `reasons` **não são consumidos por nenhuma lógica
de runtime** — só existem para (a) a IA ler e (b) o validador exigir. Confirmado
por grep: aparecem apenas em `scripts/skill-catalog.js` (gerador+validador) e no
fixture `scripts/test-scripts.js`. Logo, o blast radius é **validador + gerador +
testes + docs de contrato**, sem tocar `src/`.

## Design das novas formas

### Router (gerado)
Cabeçalho declara o template de path uma vez; entradas perdem os dois paths:
```json
{
  "pathTemplate": {
    "canonical": "{{USER_HOME}}/.orquestrador/skills/{name}/SKILL.md",
    "codex": "{{USER_HOME}}/.codex/skills/{name}/SKILL.md"
  },
  "skills": {
    "skill-lgpd-brasil": {
      "description": "...",
      "triggers": ["lgpd", "..."],
      "cost": "high",
      "safety": "privacy-law-and-data-governance"
    }
  }
}
```
A IA continua roteando por `description` + `triggers`; o path é derivado do nome.

### Chains (só grafo)
```json
{
  "skill-lgpd-brasil": {
    "mayInvoke": ["skill-supabase-rls", "..."],
    "rules": ["..."]
  }
}
```
As `reasons` migram para a seção "Related Skills" do SKILL.md dono, no formato:
`- skill-supabase-rls — Use when data isolation, tenant boundaries...`.

## Execução em estágios (cada um shippável e com teste verde)

### Estágio A — Gerador único (item 5), sem mudar forma ainda
1. Novo comando `node scripts/skill-catalog.js build-registry [--check]`:
   - Lê `SKILLS_MANIFEST.json`.
   - Reescreve `SKILLS_ROUTER.json` (mesma forma atual, incl. paths) e
     `SKILL_ALIASES.json` a partir do manifest.
   - `--check`: falha se o arquivo em disco difere do gerado (drift guard).
2. Refatorar `addCanonicalSkill` (`skill-catalog.js:150-181`) para só escrever o
   manifest e depois chamar `build-registry`.
3. Wire no `npm test`: `node scripts/skill-catalog.js build-registry --check`.
4. Verde: registro idêntico ao atual, mas agora regenerável e à prova de drift.

### Estágio B — Router enxuto (item 2)
1. `build-registry`: parar de emitir `canonicalPath`/`codexPath`; emitir
   `pathTemplate` no topo uma vez.
2. Validador (`skill-catalog.js:322`): remover `canonicalPath`/`codexPath` dos
   campos exigidos por entrada; passar a exigir `router.pathTemplate.canonical`
   e `.codex` uma vez.
3. Atualizar fixture `scripts/test-scripts.js:62-63` (remover os dois campos).
4. Regenerar router; rodar `context-budget` (deve cair ~879 tok, de 10.921 → ~10.0k).
5. Atualizar contrato de leitura: `maestro.md`, `hooks.md`, `SKILLS_INDEX.md`,
   `docs/context-economy.md` — nota "paths derivam do pathTemplate".

### Estágio C — Reasons no SKILL.md (item 3)
1. Backfill: para cada um dos **17 donos de chain / 73 arestas**, garantir que a
   seção "Related Skills" do `SKILL.md` lista cada `mayInvoke` com o motivo
   (reaproveitar o texto atual de `reasons`). Script auxiliar
   `skill-catalog.js migrate-reasons` para semear e conferir cobertura.
2. Validador (`skill-catalog.js:334-344`): trocar "exige `reasons` object" por
   "exige que a seção Related Skills do SKILL.md dono cubra cada `mayInvoke`".
3. Remover `reasons` de `SKILL_CHAINS.json`.
4. Re-espelhar os SKILL.md editados para `codex/skills/` (validador `--check-sync`).
5. Verde: chains ~2,6k tokens menor por consulta; nada duplicado.

## Riscos e mitigação
- **Quebrar a suíte de todas as ferramentas**: cada estágio é independente e só
  avança com `npm test` verde; validador e gerador mudam no mesmo commit.
- **Perder o "porquê" das arestas (item 3)**: o backfill reaproveita o texto
  atual das `reasons`; nada é descartado, só realocado.
- **Espelhos divergirem**: `build-registry` regenera de forma determinística e o
  `--check-sync` valida os mirrors.
- **Rollback**: `git revert` do commit do estágio; como router/aliases voltam a
  ser geráveis, não há estado manual a reconstruir.

## Ordem recomendada
A → B → C. A sozinho já paga (mata o drift). B é o ganho de boot barato. C é o
maior corte de tokens, mas com mais autoria (17 SKILL.md), então por último.
