# Economia De Contexto

O Orquestrador Maestro foi desenhado para reduzir tokens por organização, não por compressão agressiva de tudo. A IA deve carregar primeiro contratos curtos, índices e roteadores; só depois abre arquivos maiores quando houver evidência de necessidade.

As referências externas mais úteis aqui são duas ideias:

- RTK: compactar saídas de comandos antes que elas entrem no contexto da IA.
- Caveman: comprimir linguagem operacional e instalar ativações consistentes em várias ferramentas.

No Orquestrador, isso vira uma regra prática: contexto mínimo suficiente, com reidratação sob demanda.

## Camadas De Leitura

Ordem recomendada para qualquer IA instalada:

1. `AGENTS.md` global do usuário.
2. `.orquestrador/rules.md`.
3. `.orquestrador/maestro.md`.
4. `AGENTS.md` do projeto atual.
5. **CCP (mais fresco e barato): `DEV/context/_meta.json` → se fresco, `DEV/context/CONTEXT.md` + `INDEX.md` + `WORKLOG-DIGEST.md`** (ver "Compact Context Pack (CCP) E Frescor" abaixo). Caso contrário: `DEV/README.md`, `DEV/INDEX.md` ou `DEV/CONTEXT.md`, se existirem.
6. Roteadores compactos de skill.
7. `SKILL.md` específico da tarefa.
8. Referências internas da skill somente quando necessárias.

A IA não deve abrir `skill-library/community-skills/` inteira, nem carregar a árvore `DEV/` completa por padrão.

## Arquivos Que Economizam Tokens

| Arquivo | Uso esperado |
|---|---|
| `SKILLS_INDEX.md` | Descobrir grupos de skills sem abrir o catálogo completo. |
| `SKILL_ALIASES.json` | Traduzir termos do usuário para uma skill canônica. |
| `SKILLS_ROUTER.json` | Confirmar skill, gatilhos, custo e risco. |
| `SKILL_CHAINS.json` | Saber quais skills auxiliares podem ser chamadas. |
| `SKILL_EXECUTION_PROFILES.json` | Limitar profundidade, paralelismo e validação. |
| `DEV/INDEX.md` | Mapear documentação local do projeto. |
| `DEV/CONTEXT.md` | Recuperar estado atual sem reler todo o projeto. |
| `DEV/WORKLOG.md` | Entender alterações recentes em poucas linhas. |
| `DEV/context/CONTEXT.md` | Snapshot fresco (repo+diff+testes) sem re-derivar estado. |
| `DEV/context/_meta.json` | Frescor do CCP (generated_at, head_sha, ttl) p/ o staleness guard. |
| `DEV/context/WORKLOG-DIGEST.md` | Últimas entradas do WORKLOG (~KBs) em vez do arquivo inteiro. |

## Compact Context Pack (CCP) E Frescor

Quando um projeto tem `DEV/context/` (gerado por coletores read-only; local-only,
não versionado), a IA deve **preferir o CCP a re-derivar estado** (rodar
`git status` / `docker ps` / grep) ou ler arquivos grandes (ex.: `DEV/WORKLOG.md`
inteiro). O CCP é opcional e retrocompatível: projeto sem `DEV/context/` segue o
fluxo normal.

Staleness guard (lazy — só reidrata quando vai usar):

1. Leia `DEV/context/_meta.json`.
2. Considere **fresco** se `agora - generated_at <= ttl_minutes` **e** `head_sha`
   == HEAD atual (`git rev-parse --short HEAD`).
3. Fresco → use `CONTEXT.md` / `INDEX.md` / `WORKLOG-DIGEST.md` do CCP.
4. Stale (TTL vencido, HEAD mudou ou sem `_meta.json`) → rode o refresh do projeto
   (ex.: `bash infra/rundeck/scripts/refresh_context_ccp.sh`) e então use; se não
   houver refresh disponível, caia para comandos ao vivo.

Nunca edite arquivos do CCP à mão (são gerados). Nada de segredo/PII no CCP.

## Saídas De Comandos

A inspiração do RTK deve entrar como uma camada opcional. O Orquestrador não deve instalar reescrita automática de comandos por padrão.

Padrão recomendado:

- Começar por comandos compactos: `git status --short`, `git diff --stat`, `rg --files`, `rg "termo"`.
- Para testes, priorizar falhas e resumos antes de logs completos.
- Guardar saída longa em arquivo local quando útil e resumir só o necessário na resposta.
- Usar saída completa apenas quando o diagnóstico depender dela.

Roadmap seguro:

1. Criar wrappers opt-in para `status`, `diff`, `test`, `lint`, `tree` e `read`.
2. Preservar exit code e stderr.
3. Ter flag de saída bruta.
4. Não registrar comandos com segredos.
5. Não ativar hooks de reescrita sem consentimento explícito.

## Compressão De DEV

Uma futura skill de compressão pode resumir documentos longos em `DEV/`, desde que preserve:

- comandos;
- paths;
- URLs;
- blocos de código;
- decisões;
- riscos;
- referências de arquivos;
- datas e autores quando forem relevantes.

Ela não deve comprimir `.env`, configs com credenciais, lockfiles, bancos locais, logs privados ou código-fonte.

## Regra Para Agentes

Quando o contexto estiver grande, a IA deve responder com:

```text
Vou consultar o índice e abrir apenas os documentos necessários.
```

Depois disso, ela deve citar quais arquivos abriu e por quê. Isso mantém rastreabilidade sem gastar tokens em leitura ampla.
