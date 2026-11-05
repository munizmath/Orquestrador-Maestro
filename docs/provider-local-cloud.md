# Modelos locais e provedores remotos no Maestro

O Maestro executa modelos locais pelo OpenCode com Ollama. O catálogo pessoal do OpenCode pode incluir `ollama/llama3.1-maestro:8b` e outros modelos já baixados. O Llama 3.1 8B deve ser criado no Ollama com `num_ctx 16384` para dar espaço às ferramentas e às instruções. Nesta instalação, o Llama passou em uma tarefa de edição com `npm test` e foi escolhido como padrão local. O Qwen 3 14B também está disponível para seleção explícita, mas uma execução `go` de edição não foi validada com ele. Valide cada resultado no projeto.

```bash
ollama pull llama3.1:8b
printf 'FROM llama3.1:8b\nPARAMETER num_ctx 16384\n' > /tmp/maestro-llama.Modelfile
ollama create llama3.1-maestro:8b -f /tmp/maestro-llama.Modelfile
orquestrador-maestro run --provider opencode --model ollama/llama3.1-maestro:8b --workspace /caminho/do/projeto "Tarefa"
```

Configure o provedor Ollama em `~/.config/opencode/opencode.json` conforme a [documentação oficial do OpenCode](https://opencode.ai/docs/providers/). O adapter do Maestro usa um diretório de dados próprio em `~/.local/share/orquestrador-maestro`, preservando as sessões de uma instalação OpenCode já existente.

## OpenRouter gratuito pelo OpenCode

Selecione um modelo explícito `openrouter/<autor>/<modelo>:free`. Antes de iniciar o OpenCode, o adapter consulta o catálogo JSON público do OpenRouter e exige o mesmo ID, preço zero para entrada, saída e todos os componentes de preço informados, além de suporte a ferramentas. Preço ausente, modelo pago, roteador automático, configuração adicional do agente e catálogo indisponível bloqueiam o despacho. O modelo selecionado também é fixado como modelo auxiliar do OpenCode. O catálogo comprova o preço observado naquele instante; a quota da conta permanece `UNKNOWN` sem dados da chave. A [variante `:free` tem entrada própria](https://openrouter.ai/docs/guides/routing/model-variants/free), e um fallback para modelo pago pode gerar cobrança; por isso não configure fallback pago.

O OpenCode do Maestro usa `XDG_DATA_HOME=~/.local/share/orquestrador-maestro`. Autentique o OpenRouter pelo fluxo oficial do OpenCode nesse mesmo ambiente, sem copiar arquivos de credenciais nem colocá-los no projeto. Confira o modelo no [catálogo oficial](https://openrouter.ai/api/v1/models) antes de selecioná-lo. Uma consulta ao catálogo não envia prompts. Para tarefas remotas fora do PUE, o Maestro consulta o mandato persistente em `~/.orquestrador/REMOTE_PROVIDER_AUTHORIZATION.json`; `--allow-cloud-context` continua disponível como aprovação pontual quando o mandato estiver ausente ou fora do escopo. Em projeto PUE, a autorização de destino ainda precisa constar do mandato vigente.

```bash
XDG_DATA_HOME="$HOME/.local/share/orquestrador-maestro" opencode auth login
orquestrador-maestro run --provider opencode --model openrouter/<autor>/<modelo>:free --allow-cloud-context --workspace /caminho/do/projeto "Tarefa"
```

O perfil OpenCode do Nexus é isolado do perfil OpenCode do Maestro. Criá-lo não transfere a autenticação. O checkout local autorizado do Nexus agora consulta `opencode auth list --standalone --format json` no home isolado, em vez de depender apenas do antigo `auth.json`. Com OpenCode v2.1.4, um binário Nexus descartável confirmou a credencial OpenRouter registrada, sem ler nem mostrar seu conteúdo. O binário experimental Nexus agora usa a seleção explícita em `NEXUS_OPENCODE_EXECUTABLE`, depois o `PATH` e, sem seleção explícita, a instalação atual em `~/.opencode/bin` antes de um binário legado em `~/.local/bin`; a consulta de metadados voltou a indicar a credencial OpenRouter presente. O binário global anterior não foi substituído. A saúde remota fica `UNKNOWN`: essa lista não comprova resposta do modelo, quota ou custo. Ollama local dispensa chave. Uma sessão interativa pessoal no Nexus não é despacho PUE homologado.

## DeepSeek com orçamento compartilhado

O provider `deepseek` usa um gateway local compatível com Responses API, um ledger SQLite único e tokens efêmeros por execução. A configuração privada `~/.config/orquestrador-maestro/providers.json` aponta para o repositório do gateway, seu diretório de estado e o arquivo da chave. Não copie a chave para o OpenCode, para o Maestro ou para o repositório público.

```json
{
  "deepseekGateway": {
    "root": "/caminho/do/repositorio-com-gateway",
    "stateDir": "/caminho/do/ledger-compartilhado",
    "envFile": "/caminho/do/arquivo-de-chave-0600",
    "port": 8765
  }
}
```

Todos os projetos que compartilham o orçamento devem apontar para **o mesmo** `stateDir`. Use `providers report deepseek` para consultar o teto e o gasto acumulado; `providers start deepseek` inicia o gateway em `127.0.0.1`. O gateway atualmente aceita `deepseek-flash` e impõe o limite de US$ 40 em 30 dias. Ele bloqueia chamadas quando o saldo ou o ledger não permitem a reserva. Uma chamada direta à API fora do gateway não entra nesse controle.

O teto histórico do ledger não é autorização atual de gasto. Com custo incremental autorizado em R$ 0,00, consulte o relatório e execute apenas testes simulados; não inicie chamadas reais da API DeepSeek. Um modelo DeepSeek `:free` no OpenRouter segue a rota OpenRouter e não compartilha esse ledger.

```bash
orquestrador-maestro providers start deepseek
orquestrador-maestro providers report deepseek
orquestrador-maestro run --provider deepseek --model deepseek-flash --allow-cloud-context --workspace /caminho/do/projeto "Tarefa"
```

## Claude Code e confirmação por tarefa

O provider `claude` usa o login já existente do Claude Code. Selecione o modelo com `--model`, se necessário. Nas execuções `run`, o Maestro usa o modo `acceptEdits` do Claude Code para permitir edição sem um prompt interativo. Com um mandato persistente ativo e dentro do escopo, não é necessário repetir `--allow-cloud-context` para Claude, DeepSeek ou modelos remotos do OpenCode, inclusive como fallback. O sinalizador continua confirmando uma tarefa pontual quando o mandato não cobre o workspace, o provider ou a classe de dados. A aprovação de um plano em `go` continua independente dessa confirmação.

```bash
orquestrador-maestro run --provider claude --model sonnet --allow-cloud-context --workspace /caminho/do/projeto "Tarefa"
orquestrador-maestro go --provider deepseek --model deepseek-flash --allow-cloud-context --project-path /caminho/do/projeto "Objetivo"
```

O fallback de provider só ocorre nas falhas classificadas como falha do provider pelo Runtime. Ele não troca de modelo para contornar um bloqueio de orçamento ou uma decisão humana. O uso do Claude Code depende dos limites da conta autenticada; o Maestro não tem acesso ao saldo dessa assinatura.

No fluxo `go`, a execução de uma tarefa pode editar arquivos e passar em testes, mas a missão permanece em `needs_attention` quando os critérios de aceite do plano não têm evidências vinculadas. O Maestro preserva esse bloqueio em vez de declarar a tarefa validada apenas com a resposta do modelo. Interromper uma chamada DeepSeek durante o streaming também pode deixar uma reserva `UNCERTAIN` no gateway; ela exige reconciliação conservadora antes de novas chamadas.

## Nexus opcional

O adapter Nexus é desativado por padrão. `MAESTRO_NEXUS_MODE=observe` habilita consultas locais explícitas por `orquestrador-maestro providers observe nexus`. `MAESTRO_NEXUS_EXECUTABLE` pode apontar para um binário fora do `PATH`. O contrato pinado em `0.5.0-beta.23` usa `version --json`, `providers --json`, `sessions --json`, `usage --json`, `ps --json`, `profiles --json`, `workspaces --json` e `control status <id> --json`. Para um build `dev`, `MAESTRO_NEXUS_ALLOW_DEV_OBSERVATION=1` permite somente observação após sondar o catálogo JSON. Outros builds sem revisão continuam incompatíveis. A saída reduz perfis a contagens e elegibilidade estimada pela autenticação local, workspaces a contagens e runtimes a identificadores e estados; não expõe contas, nomes de perfil, caminhos ou títulos. A consulta real ao binário local `dev` confirmou as saídas JSON de leitura, sem executar modelos. A configuração não comprova direitos de uso.

A versão reconhecida só é considerada compatível quando `providers --json` devolve o catálogo no formato esperado. Falha ou formato diferente bloqueia a observação; resposta inválida nas demais consultas gera observação parcial com dados desconhecidos, sem interpretar texto ou objetos inesperados como estado vazio confirmado.

`orquestrador-maestro providers preflight nexus --project-path PATH --pue-root PATH --execution-id ID --task-id ID` consulta o preflight e o Work Graph canônicos do PUE. Exige policy, mandato contínuo e Envelope v4 válidos, unidade `READY`, identidade completa da execução e escopo/capacidades contidos, inclusive caminhos proibidos pelo mandato. Como o executor atual exige worktree, o schema canônico do PUE precisa permitir esse modo e `governance/project.yaml` precisa declará-lo explicitamente; proibição ou ausência em qualquer uma das fontes bloqueia antes de emitir Envelope ou tomar lease. O schema PUE aceita `allowed` mediante opt-in explícito no manifesto; o padrão continua `forbidden`. O resultado `READY` não toma lease, não emite Envelope operacional e não despacha trabalho. A leitura canônica do Work Graph pode criar um lock e reconciliar sua projeção a partir do Journal. A instalação PUE é fornecida por `--pue-root` ou `MAESTRO_PUE_ROOT`. O projeto deste espelho público não contém `policy/pue-policy.yaml`, portanto a checagem nele retorna `BLOCKED_POLICY`.

Se o projeto aceitou uma decisão que substitui o Envelope para atividades novas, a bridge PUE legada retorna `BLOCKED_DECISION/PUE_ENVELOPE_REGIME_SUPERSEDED` antes do preflight. Um mandato ou Envelope histórico não pode ser reutilizado para despachar pelo Nexus; é preciso reconciliar o contrato de admissão com o regime normativo vigente do projeto. A bridge não interpreta essa decisão como autorização automática.

O checkout local experimental do Nexus agora aceita requisições `maestro-unit` v2 com `admission_kind=track_receipt`, `admission_ref` e `admission_digest`, sem Envelope. O claim SQLite, o WorkPlan e as respostas de estado preservam esse vínculo após reinício; a CLI anuncia os schemas de requisição 1 e 2 em `capabilities --json`. O adapter Maestro expõe `trackReceiptTransportAvailable` somente quando a sonda JSON confirma os dois schemas e `track_receipt`; esse indicador descreve o transporte, não a admissão PUE. A bridge Maestro ainda despacha somente o schema v1 validado pelo PUE. O Maestro ratificou em 2026-10-27 o mandato novo por trilha e o evento `WORK_AUTHORIZED` como recibo para atividades novas do UltraApp, sem assinatura por unidade. O registro canônico e a implementação PUE dependem do preflight autorizado; a ratificação, sozinha, não habilita o UltraApp nem substitui o mandato vigente.

O modo `execute` sonda `maestro-unit capabilities --json` e exige o schema v1 com `dispatch`, `status`, `cancel`, `recover` e `release`, `dispatch_mode=jsonl`, `status_mode=json`, `admission=external_pue_required` e `workspace_mode=ephemeral_detached_worktree`. O checkout local do Nexus cria um worktree por execução com `git worktree add --detach` e recusa reutilizar um worktree ligado a branch ou a outro repositório; o Maestro rejeita binários que não declarem essa capacidade. O build local `dev` requer `MAESTRO_NEXUS_ALLOW_DEV_EXECUTION=1`; a versão antiga sem essa sonda segue apenas observável. `executionAvailable` permanece `false` para a rota genérica de prompts, enquanto `unitExecutionAvailable` indica a rota exclusiva de unidades PUE. O comando `nexus run` não é usado.

Para despachar uma unidade já autorizada, configure `MAESTRO_NEXUS_MODE=execute` e aponte `MAESTRO_NEXUS_EXECUTABLE` ao binário compatível. Builds locais `dev` também exigem `MAESTRO_NEXUS_ALLOW_DEV_EXECUTION=1`. O projeto deve estar registrado no Nexus com isolamento `worktree`, policy PUE, mandato contínuo e Work Graph canônico. Use `--nexus-project-id` para o projeto registrado e fixe `--provider`; `--profile` seleciona uma conta específica. Este comando pode chamar um provedor real e deve ser usado apenas sob autorização de uso e orçamento aplicáveis:

```bash
orquestrador-maestro providers dispatch nexus --project-path /caminho/do/projeto --pue-root /caminho/do/pue --execution-id CHANGE-ID --task-id UNIT-ID --nexus-project-id PROJECT-ID --provider codex --profile work
```

A bridge valida o mandato e a unidade `READY`, toma o lease canônico, escreve o Envelope, registra autorização e identidade no Journal e despacha uma única vez pela CLI JSONL. O resultado da worktree só é aplicado ao checkout PUE quando HEAD está destacado e a identidade, a revisão base, o conjunto de arquivos e o escopo conferem; symlinks e alterações concorrentes bloqueiam a promoção. `COMPLETED_VERIFIED` no Nexus aciona os gates PUE; somente `PASS` gera `GATE_PASSED` e transição para `COMPLETED`. Saída incompleta, falha ambígua ou gate bloqueado requer intervenção, sem novo despacho automático. Uma execução longa renova o lease pelo backend canônico. Após `GATE_PASSED` e a transição da unidade para `COMPLETED`, a bridge chama `release` para remover o worktree transitório. Falha na remoção produz `COMPLETED_CLEANUP_PENDING` e permite repetir apenas a limpeza, sem novo despacho. A regra ratificada está na ADR-0149 do PUE; cada projeto precisa declarar `worktrees: allowed` em seu manifesto. O despacho por unidade foi comprovado com simulador; a interoperabilidade com provedor real ainda não foi homologada.

As operações `providers status nexus`, `providers cancel nexus`, `providers recover nexus` e `providers cleanup nexus` recebem os mesmos identificadores e caminhos do despacho, além de `--nexus-project-id`. Elas consultam o Journal e o Envelope originais antes de tocar a execução Nexus. A recuperação recusa resultado externo desconhecido e revalida o mandato atual; só retoma uma execução que o Nexus marque como recuperável. O cancelamento registra o pedido e preserva a unidade em estado rastreável. A recuperação simulada de um resultado ambíguo foi bloqueada; retomada real de provedor permanece sem homologação. `cleanup` só atua depois dos gates PUE e da conclusão no Work Graph, sem redispatch.

A [CLI pública verificada na branch `release/v1.0.0`](https://github.com/IAPro-Community/nexus/blob/f37af7a3b6a7a0650f7a413905aa19149a817779/internal/app/nexus_cli_cmds.go) acrescenta `plan run <plan-id> [agent-id]`, com `run_id`, `state` e `plan_id` em JSON somente após a Mission estabilizar; `plan create` ainda imprime o identificador em texto. Esse contrato não recebe `execution_id`, Envelope ou mandato, nem fornece uma operação JSON de consulta ou cancelamento por unidade PUE. A [forma `nexus run <goal>` dessa revisão](https://github.com/IAPro-Community/nexus/blob/f37af7a3b6a7a0650f7a413905aa19149a817779/internal/app/app.go) cria seu próprio plano e não é usada para contornar a admissão. A publicação consultada é uma [preview sem assinatura nem certificação](https://github.com/IAPro-Community/nexus/releases/tag/preview-f23ed9b88725e9bc4df80ded19a89b2e7f8a326a); a leitura do código público não prova compatibilidade com o binário instalado.

O campo de quota ausente continua `UNKNOWN`; custo ausente não vira zero. `control status` pode devolver registro de runtime quando o host não responde, portanto o adapter não infere retomada nativa ou reconexão comprovada desse comando. A bridge usa o estado estruturado `maestro-unit`; quando ele indicar efeito externo desconhecido, exige intervenção em vez de repetir a operação.
