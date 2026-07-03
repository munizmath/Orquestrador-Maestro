# Radar De Junho 2026

Data da revisão inicial: `2026-06-26`
Atualização complementar: `2026-06-30`

Objetivo: avaliar referências externas úteis para UX/UI, empacotamento, atualização, skills, ingestão segura de bibliotecas privadas e economia real de contexto, sem copiar código ou conteúdo protegido para o snapshot público.

## Fontes Revisadas

| Fonte | Tipo | Evidência observada | O que extrair | Decisão para o Orquestrador |
|---|---|---|---|---|
| [`tenfoldmarc/website-builder-setup`](https://github.com/tenfoldmarc/website-builder-setup) | skill-pack focado em setup | último commit observado em `2026-04-16` (`83d94da`) | onboarding por resultado, fluxo passo a passo, linguagem simples para quem não é técnico | **Adotar o padrão**, mas sem copiar o skill nem depender de repo sem licença explícita |
| [`bradautomates/claude-video`](https://github.com/bradautomates/claude-video) | skill/plugin multi-superfície | release `0.1.3` em `2026-05-09`; MIT | `CHANGELOG.md` separado, empacotamento multi-superfície, preflight/setup e comando claro de update | **Adotar o padrão** com `CHANGELOG.md` canônico e CLI com `doctor`/`changelog` |
| [`anthropics/claude-cookbooks`](https://github.com/anthropics/claude-cookbooks) | cookbook e registry de padrões | último commit observado em `2026-06-09` (`34022c5`); MIT | registry datado, categorias, observabilidade, context engineering, frontend aesthetics, managed agents | **Adotar o padrão** de radar estruturado, referências datadas e UX/UI stack intencional |
| [Google Drive "CS Fundamentals(Lets Code)"](https://drive.google.com/drive/folders/18FBvExqEtt9mtNKKP65f_ETdtS7nCG1G) | biblioteca pública de estudo e referência | snapshot público visível em `2026-06-26`; itens mostrados com datas `2024-09-04`, `2025-03-16`, `2025-05-25` e `2025-10-08` | necessidade de consumir bibliotecas privadas/publicadas por índice, não por dump completo | **Não redistribuir conteúdo**; criar padrão de `reference packs` locais |
| [`DietrichGebert/ponytail`](https://github.com/DietrichGebert/ponytail) | plugin/skill de disciplina de implementação | README consultado em `2026-06-30`; release `v4.8.4` publicada em `2026-06-29`; MIT | regra de menor implementação suficiente, evitar overengineering, benchmark por diff real, hooks/subagentes mantendo a mesma disciplina | **Adotar como princípio operacional**, sem copiar prompt, personagem, assets ou implementação |
| [`millionco/react-doctor`](https://github.com/millionco/react-doctor) | CLI, skill e gate para React | README consultado em `2026-06-30`; repo informa audit local, skill para agentes, CI por PR e configuração em `doctor.config.ts` | transformar revisão React em gate determinístico, separar issue nova de backlog antigo, instalar skill opcional para agentes | **Adotar como referência para futura skill/gate React**, mantendo opt-in e compatível com projetos não React |
| [`headroomlabs-ai/headroom`](https://github.com/headroomlabs-ai/headroom) | camada local-first de compressão de contexto | README consultado em `2026-06-30`; promete compressão de tool outputs, logs, arquivos, RAG e histórico via library/proxy/MCP/wrap | compressão reversível, roteamento por tipo de conteúdo, MCP de compressão/retrieval/stats, armazenamento local de originais | **Adotar como roadmap opt-in**, não como wrapper automático padrão |

## O Que A Biblioteca Do Drive Mostra

A pasta pública exposta no Google Drive contém pelo menos:

- pastas `Computer Network`, `DBMS & SQL`, `DSA`, `OOPs`, `Operating System`, `Software Engineering` e `System Design`;
- documentos como `Lets Code.pdf`, `Lets Code Resoures`, `HR Interview Questions.pdf`, `leetcode problems.pdf` e templates de currículo/carta.

Esse tipo de acervo é útil como biblioteca de apoio para agentes, mas não deve ser embutido no repositório público por três motivos:

1. origem/licença nem sempre estão claras;
2. o valor está no índice e no roteamento, não em despejar centenas de páginas no contexto;
3. muita gente vai querer fazer o mesmo com PDFs internos, runbooks, normas e documentação privada.

## Novas Lições De Otimização

### 1. Ponytail: menor implementação suficiente

Ponytail reforça uma regra que combina bem com o Orquestrador: antes de criar abstração, dependência, componente customizado ou classe grande, o agente deve provar que o caminho simples não resolve.

O que vale absorver:

- gate mental de YAGNI antes de escrever código;
- preferência por recurso nativo da plataforma quando atende ao requisito;
- medição por `git diff`, não por sensação de produtividade;
- disciplina aplicada também a subagentes, para que delegação não vire multiplicação de código desnecessário;
- níveis de intensidade para a regra, em vez de uma instrução única sempre igual.

Aplicação sugerida no Orquestrador:

- incluir um "minimal implementation gate" nas skills de frontend, SaaS e multiagentes;
- pedir ao agente para declarar quando escolheu solução nativa em vez de pacote novo;
- registrar no `DEV/WORKLOG.md` quando uma decisão removeu código, dependência ou escopo;
- manter isso como princípio próprio, sem copiar linguagem, persona ou assets do Ponytail.

### 2. React Doctor: gate determinístico para React

React Doctor mostra um caminho útil para reduzir revisão subjetiva em projetos React: rodar um CLI, transformar achados em skill para agentes e integrar CI/PR com foco no que a mudança nova introduziu.

O que vale absorver:

- uma skill de correção baseada em diagnósticos reais;
- um comando de audit local antes de pedir que a IA "melhore React";
- gate de PR que comenta resumo e não tenta reabrir todo o backlog antigo;
- configuração explícita de regras em arquivo dedicado;
- telemetria com opt-out e sem conteúdo de arquivo, quando existir.

Aplicação sugerida no Orquestrador:

- criar ou reforçar uma skill canônica `skill-react-quality-gate`;
- permitir referência opcional a `react-doctor` em projetos React, sem instalar por padrão em todo mundo;
- documentar um gate: `audit -> corrigir -> verificar -> registrar em DEV/VERIFY.md`;
- separar "problemas novos da PR" de "dívida antiga do projeto", para evitar loops.

### 3. Headroom: compressão reversível e mensurável

Headroom é a referência mais próxima do problema relatado sobre consumo de contexto: comprimir outputs, logs, arquivos, RAG e histórico antes de entrar no LLM, com recuperação sob demanda dos originais.

O que vale absorver:

- compressão por tipo de conteúdo, não compressão cega;
- armazenamento local dos originais e retrieval quando a IA realmente precisar;
- MCP com ferramentas separadas para comprimir, recuperar e medir estatísticas;
- uso opcional como library/proxy/wrapper, não mutação invisível do fluxo do usuário;
- métricas de economia: tokens antes, tokens depois, taxa de compressão e impacto na resposta.

Aplicação sugerida no Orquestrador:

- manter o padrão atual de hooks compactos e roots nativos enxutos como base;
- adicionar roadmap de um `context-compression-provider` opt-in;
- comprimir primeiro saídas longas de comandos, logs e histórico frio do `DEV/WORKLOG.md`;
- preservar arquivo original localmente quando a compressão puder perder detalhe;
- nunca comprimir arquivos sensíveis sem política explícita de privacidade.

## Decisões Convertidas Em Produto

### 1. Update flow explícito

Inspirado em `claude-video`, o Orquestrador agora passa a tratar release notes e diagnóstico como parte do produto, não só da manutenção:

- `CHANGELOG.md` canônico no pacote;
- `orquestrador-maestro changelog`;
- `orquestrador-maestro doctor`;
- fluxo recomendado para instalados: `npm update -g`, `changelog`, `update`, `verify`, `doctor`.

### 2. UX/UI stack intencional

`website-builder-setup` e o cookbook de frontend aesthetics reforçam que UX/UI bom não nasce de um prompt genérico. No Orquestrador, o caminho recomendado fica:

1. `skill-open-design-ui`: direção visual, tokens, biblioteca e QA visual.
2. `skill-modern-ui-patterns`: implementação operacional para SaaS, admin e produto.
3. `skill-frontend-ux-guardrails`: gate final de responsividade, overflow, acessibilidade, ortografia e estados.

### 3. Reference packs locais

O Drive mostrou a necessidade de um padrão seguro para bibliotecas externas. Em vez de publicar material de terceiros, o Orquestrador passa a documentar:

- índice local primeiro;
- leitura por demanda;
- nada de bulk-load de uma pasta inteira;
- nada disso entra no snapshot público.

### 4. Contexto por camadas

Ponytail, React Doctor e Headroom reforçam que a otimização não deve ser apenas "resumir texto". O Orquestrador deve combinar:

- menos código quando uma solução simples resolve;
- gate determinístico quando existe ferramenta especializada;
- compressão reversível quando o volume de contexto fica alto;
- `DEV/HANDOFF.md`, `DEV/SPECS/ACTIVE.md`, `DEV/VERIFY.md` e `DEV/WORKLOG.md` como memória curta controlada.

## Crédito Comunitário

As referências Ponytail, React Doctor e Headroom entram nesta revisão a partir da curadoria e discussão com Hector Noya e Felinto, integrantes do Grupo IAPro. Eles ficam registrados como colaboradores comunitários desta melhoria. O crédito fica limitado aos nomes informados e não inclui telefone, prints privados ou dados pessoais.

## O Que Não Foi Adotado

- copiar `SKILL.md`, texto, assets ou estrutura inteira de repositórios externos;
- depender de instalação "mágica" de terceiros sem deixar o fluxo auditável;
- vender código de terceiros ou materiais do Drive dentro do pacote público;
- carregar automaticamente pastas enormes do usuário só porque elas existem;
- instalar Ponytail, React Doctor ou Headroom como dependência obrigatória do Orquestrador;
- comprimir contexto sensível sem política de privacidade e recuperação local clara.

## Próximos Passos Recomendados

1. Publicar a próxima versão npm depois de validar `doctor` e `changelog` no pacote empacotado.
2. Criar um pequeno status/release checklist visual no README para reduzir erro humano de update.
3. Avaliar um registry leve de referências externas curadas, no estilo `registry.yaml`, se o volume de pesquisas crescer.
4. Manter a UX/UI stack como convenção documentada e não como prompt solto em conversa.
5. Criar uma skill/gate opt-in para React que use diagnósticos objetivos antes de edição por IA.
6. Prototipar compressão opt-in para outputs longos e worklogs frios, preservando originais localmente.
7. Adicionar um "minimal implementation gate" nas skills de frontend/SaaS para reduzir overengineering.
