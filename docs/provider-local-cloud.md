# Modelos locais e provedores remotos no Maestro

O Maestro executa modelos locais pelo OpenCode com Ollama. O catálogo pessoal do OpenCode pode incluir `ollama/llama3.1-maestro:8b` e outros modelos já baixados. O Llama 3.1 8B deve ser criado no Ollama com `num_ctx 16384` para dar espaço às ferramentas e às instruções. Nesta instalação, o Llama passou em uma tarefa de edição com `npm test` e foi escolhido como padrão local. O Qwen 3 14B também está disponível para seleção explícita, mas uma execução `go` de edição não foi validada com ele. Valide cada resultado no projeto.

```bash
ollama pull llama3.1:8b
printf 'FROM llama3.1:8b\nPARAMETER num_ctx 16384\n' > /tmp/maestro-llama.Modelfile
ollama create llama3.1-maestro:8b -f /tmp/maestro-llama.Modelfile
orquestrador-maestro run --provider opencode --model ollama/llama3.1-maestro:8b --workspace /caminho/do/projeto "Tarefa"
```

Configure o provedor Ollama em `~/.config/opencode/opencode.json` conforme a [documentação oficial do OpenCode](https://opencode.ai/docs/providers/). O adapter do Maestro usa um diretório de dados próprio em `~/.local/share/orquestrador-maestro`, preservando as sessões de uma instalação OpenCode já existente.

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

```bash
orquestrador-maestro providers start deepseek
orquestrador-maestro providers report deepseek
orquestrador-maestro run --provider deepseek --model deepseek-flash --allow-cloud-context --workspace /caminho/do/projeto "Tarefa"
```

## Claude Code e confirmação por tarefa

O provider `claude` usa o login já existente do Claude Code. Selecione o modelo com `--model`, se necessário. Nas execuções `run`, o Maestro usa o modo `acceptEdits` do Claude Code para permitir edição sem um prompt interativo. O Maestro exige `--allow-cloud-context` em cada comando `run` ou `go` que use Claude, DeepSeek ou um modelo remoto no OpenCode, inclusive como fallback. O sinalizador confirma o envio do contexto daquela tarefa; um comando seguinte precisa de nova confirmação. A aprovação de um plano em `go` continua independente dessa confirmação.

```bash
orquestrador-maestro run --provider claude --model sonnet --allow-cloud-context --workspace /caminho/do/projeto "Tarefa"
orquestrador-maestro go --provider deepseek --model deepseek-flash --allow-cloud-context --project-path /caminho/do/projeto "Objetivo"
```

O fallback de provider só ocorre nas falhas classificadas como falha do provider pelo Runtime. Ele não troca de modelo para contornar um bloqueio de orçamento ou uma decisão humana. O uso do Claude Code depende dos limites da conta autenticada; o Maestro não tem acesso ao saldo dessa assinatura.

No fluxo `go`, a execução de uma tarefa pode editar arquivos e passar em testes, mas a missão permanece em `needs_attention` quando os critérios de aceite do plano não têm evidências vinculadas. O Maestro preserva esse bloqueio em vez de declarar a tarefa validada apenas com a resposta do modelo. Interromper uma chamada DeepSeek durante o streaming também pode deixar uma reserva `UNCERTAIN` no gateway; ela exige reconciliação conservadora antes de novas chamadas.

## Nexus opcional

O adapter Nexus é desativado por padrão. `MAESTRO_NEXUS_MODE=observe` habilita consultas locais explícitas por `orquestrador-maestro providers observe nexus`. `MAESTRO_NEXUS_EXECUTABLE` pode apontar para um binário fora do `PATH`. O contrato pinado em `0.5.0-beta.23` usa `version --json`, `providers --json`, `sessions --json`, `usage --json`, `ps --json`, `profiles --json`, `workspaces --json` e `control status <id> --json`. Para um build `dev`, `MAESTRO_NEXUS_ALLOW_DEV_OBSERVATION=1` permite somente observação após sondar o catálogo JSON. Outros builds sem revisão continuam incompatíveis. A saída reduz perfis a contagens e elegibilidade estimada pela autenticação local, workspaces a contagens e runtimes a identificadores e estados; não expõe contas, nomes de perfil, caminhos ou títulos. A consulta real ao binário local `dev` confirmou as saídas JSON de leitura, sem executar modelos. A configuração não comprova direitos de uso.

`orquestrador-maestro providers preflight nexus --project-path PATH --pue-root PATH --execution-id ID --task-id ID` consulta o preflight e o Work Graph canônicos do PUE. Exige policy, mandato contínuo e Envelope v4 válidos, unidade `READY`, identidade completa da execução e escopo/capacidades contidos, inclusive caminhos proibidos pelo mandato. O resultado `READY` não toma lease, não emite Envelope operacional e não despacha trabalho. A leitura canônica do Work Graph pode criar um lock e reconciliar sua projeção a partir do Journal. A instalação PUE é fornecida por `--pue-root` ou `MAESTRO_PUE_ROOT`. O projeto deste espelho público não contém `policy/pue-policy.yaml`, portanto a checagem nele retorna `BLOCKED_POLICY`.

O modo `execute` detecta o binário, mas continua com `executionAvailable: false`: a CLI local não expõe despacho estruturado que vincule unidade, Envelope e `execution_id` a um recibo correlacionado. `nexus run` executa diretamente um provider e não é usado como substituto da admissão. Sem esse contrato, não há acompanhamento, cancelamento ou recuperação por unidade PUE. O campo de quota ausente continua `UNKNOWN`; custo ausente não vira zero. `control status` pode devolver registro de runtime quando o host não responde, portanto o adapter não infere retomada nativa ou reconexão comprovada desse comando.
