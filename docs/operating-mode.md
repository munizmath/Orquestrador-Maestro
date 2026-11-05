# Modo operacional do Orquestrador Maestro

O Maestro mantém o desenvolvimento entre ferramentas sem transformar cada sessão em uma nova autorização manual. O controle é persistente, limitado, revogável e observável.

## Preflight explicável

Antes de uma tarefa ampla, consulte o estado sem executar nenhum provedor:

```bash
orquestrador-maestro preflight --project-path . --providers opencode,claude,nexus
orquestrador-maestro preflight --project-path . --json
```

O resultado informa workspace, autorização, raízes permitidas, provedores, custo incremental, roster e impedimentos.

## Contexto seguro

O pacote de contexto omite segredos, binários, diretórios de ferramentas e arquivos grandes. O conteúdo não é incluído por padrão:

```bash
orquestrador-maestro context pack --project-path . --json
orquestrador-maestro context pack --project-path . --include-content --max-files 80
```

`--include-content` deve ser usado somente quando o envio do conteúdo estiver dentro do mandato remoto ativo.

## Saúde dos provedores

Observações de provedores são mantidas como um registro sanitizado com TTL; nenhuma credencial ou saída bruta é salva:

```bash
orquestrador-maestro providers observe nexus
orquestrador-maestro providers health --json
```

O roster elástico usa o maior conjunto saudável disponível, respeitando isolamento, quota, custo e o teto de 20 editores.

## Limpeza segura

O Maestro executa uma manutenção automática estreita ao encerrar comandos normais: apenas temporários próprios vencidos e entradas de saúde expiradas. Para inspecionar ou executar uma limpeza dedicada:

```bash
orquestrador-maestro cleanup --project-path . --json
orquestrador-maestro cleanup --project-path . --apply
```

Recibos, código do usuário, worklogs, evidências e arquivos fora das áreas próprias não são removidos.

## Canais dev e stable

```bash
orquestrador-maestro channel status
orquestrador-maestro channel validate
```

`dev` pode apontar para checkout em evolução. `stable` só é considerada pronta com checkout limpo, commit identificável e entrypoint não simbólico. A promoção continua sendo uma ação humana explícita.

## Recibos

Cada execução terminal gera `.orquestrador-maestro/receipts/<run-id>.json`, contendo apenas hashes, estado, arquivos, verificação, uso agregado e evidência de delegação. Prompts, conteúdo de arquivos, tokens e credenciais nunca são persistidos.

```bash
orquestrador-maestro run receipt <run-id> --project-path .
```
