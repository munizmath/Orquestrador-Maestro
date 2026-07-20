# Runbook Local Para Leigos

Status: local-only.

Este guia explica como usar o Orquestrador Maestro no WSL/Ubuntu com foco em
prevenir e corrigir erros comuns. Ele evita dados reais: troque valores entre
`<...>` pelos seus valores locais.

## 0. Regra Principal

Use sempre o terminal do Ubuntu/WSL, com usuário normal, dentro da pasta do
projeto.

Evite:

- PowerShell ou CMD apontando para `\\wsl.localhost\...`.
- Prompt como `root@...`.
- `node` do Windows dentro do WSL.
- Colar token, telefone real ou chave em arquivos rastreados pelo Git.

Use:

```bash
cd ~/Projetos/Orquestrador-Maestro
```

Se o projeto estiver em outra pasta, entre nela antes de rodar comandos.

Quando este guia disser `node`, leia como "Node do Linux dentro do WSL". Se
você ainda estiver em dúvida, use `/usr/bin/node` explicitamente.

## 1. Abrir O Terminal Correto

### Passo

Abra o Ubuntu/WSL pelo menu do Windows ou por um terminal já conectado ao
Ubuntu.

Depois rode:

```bash
pwd
whoami
```

O esperado:

```text
/home/<usuario>/...
<usuario>
```

### Erro: Estou Como `root`

Sinal:

```text
root@DESKTOP:...
```

Correção:

```bash
exit
```

Se ainda voltar como root, abra um novo terminal Ubuntu/WSL e entre como usuário
normal.

Por que importa: rodar como root pode criar arquivos que seu usuário normal não
consegue editar depois.

### Erro: Permissão Negada Depois De Ter Usado Root

Sinal:

```text
EACCES
permission denied
```

Correção dentro da pasta do projeto:

```bash
sudo chown -R "$USER:$USER" .
```

Depois rode:

```bash
git status --short
```

Se aparecerem arquivos modificados inesperados, não apague nada; valide antes de
continuar.

### Erro: `sudo` Pede Senha E Eu Nao Sei A Senha

Sinal:

```text
[sudo] password for <usuario>:
```

Ao digitar a senha no Linux, nada aparece na tela. Isso é normal: não aparecem
nem asteriscos. Digite e pressione Enter.

Se você realmente não sabe a senha do usuário WSL, redefina pelo Windows.

No PowerShell do Windows, rode:

```powershell
wsl -d Ubuntu -u root
```

Dentro do shell que abrir como root, rode:

```bash
passwd <usuario>
```

Exemplo:

```bash
passwd usuario
```

Digite uma nova senha duas vezes. Depois saia:

```bash
exit
```

Abra o Ubuntu/WSL normalmente e teste:

```bash
sudo -v
```

Se sua distribuição não se chama `Ubuntu`, veja os nomes disponíveis no
PowerShell:

```powershell
wsl -l -v
```

Use o nome exato na opção `-d`.

Observação: você não precisa de `sudo` para usar o Orquestrador no dia a dia.
`sudo` só aparece em correções como instalar `curl`, instalar `nano` ou arrumar
permissões quebradas.

### Erro: `passwd: Authentication token manipulation error`

Sinal:

```text
Changing password for <usuario>.
Current password:
passwd: Authentication token manipulation error
passwd: password unchanged
```

Causa: você rodou `passwd <usuario>` como o próprio usuário normal. Nesse caso,
o Linux exige a senha atual. Se você não sabe a senha atual, a troca falha.

Correção: faça a troca como `root` pelo PowerShell do Windows.

No PowerShell:

```powershell
wsl -l -v
wsl -d Ubuntu -u root
```

Dentro do shell root:

```bash
passwd <usuario>
```

Depois:

```bash
exit
```

Abra o Ubuntu normal e teste:

```bash
sudo -v
```

Se `wsl -d Ubuntu -u root` não abrir a distribuição certa, use o nome exato
mostrado por `wsl -l -v`.

## 2. Entrar Na Pasta Do Projeto

### Passo

```bash
cd ~/Projetos/Orquestrador-Maestro
pwd
```

O esperado é terminar com:

```text
Projetos/Orquestrador-Maestro
```

### Erro: Pasta Não Existe

Sinal:

```text
No such file or directory
```

Diagnóstico:

```bash
ls ~
ls ~/Projetos
```

Procure a pasta correta e entre nela. Se o projeto estiver em outro lugar, use
esse caminho.

### Erro: `Cannot find module '/home/<usuario>/bin/orquestrador-maestro.js'`

Sinal:

```text
Error: Cannot find module '/home/<usuario>/bin/orquestrador-maestro.js'
```

Causa: você rodou `node bin/orquestrador-maestro.js ...` estando em `~`
(`/home/<usuario>`), não dentro da pasta do projeto.

Confirme:

```bash
pwd
```

Se aparecer:

```text
/home/<usuario>
```

entre no projeto:

```bash
cd ~/Projetos/Orquestrador-Maestro
```

Depois rode novamente:

```bash
node bin/orquestrador-maestro.js config validate
node bin/orquestrador-maestro.js config explain
```

Alternativa se você quiser rodar de qualquer pasta:

```bash
node ~/Projetos/Orquestrador-Maestro/bin/orquestrador-maestro.js config validate
node ~/Projetos/Orquestrador-Maestro/bin/orquestrador-maestro.js config explain
```

### Erro: Caminho UNC `\\wsl.localhost`

Sinal:

```text
CMD.EXE foi iniciado tendo o caminho acima como pasta atual.
Nao ha suporte para caminhos UNC.
```

Causa: algum comando foi executado pelo Windows/CMD, não pelo Linux do WSL.

Correção:

1. Feche o terminal problemático.
2. Abra Ubuntu/WSL.
3. Entre por caminho Linux:

```bash
cd ~/Projetos/Orquestrador-Maestro
```

Não rode comandos a partir de `\\wsl.localhost\Ubuntu\...`.

## 3. Garantir Que O Node E Do Linux

### Passo

```bash
which node
node -p "process.execPath + ' ' + process.platform + ' ' + process.version"
```

O esperado:

```text
... linux v18...
```

ou versão maior que 18.

Também é aceitável:

```text
... linux v24...
```

### Erro: Aparece `win32` Ou Caminho Do Windows

Sinal:

```text
/mnt/c/Program Files/nodejs/node.exe
win32
```

ou erro parecido com:

```text
Cannot find module 'C:\Windows\scripts\run-validate.js'
```

Causa: o WSL chamou o Node do Windows.

Correção rápida para esta sessão:

```bash
/usr/bin/node -p "process.platform + ' ' + process.version"
```

Se funcionar e mostrar `linux`, use `/usr/bin/node` no lugar de `node`:

```bash
/usr/bin/node bin/orquestrador-maestro.js health local
```

Se existir Node local do projeto/usuário:

```bash
$HOME/.local/bin/node -p "process.platform + ' ' + process.version"
$HOME/.local/bin/node bin/orquestrador-maestro.js health local
```

Correção prática para o terminal atual:

```bash
alias node="$HOME/.local/bin/node"
hash -r
node -p "process.platform + ' ' + process.version"
```

Se `$HOME/.local/bin/node` não existir, use:

```bash
alias node="/usr/bin/node"
hash -r
```

### Erro: Node Muito Antigo

Sinal:

```text
v16...
```

O projeto espera Node 18 ou superior.

Tente:

```bash
nodejs -p "process.platform + ' ' + process.version"
```

Se `nodejs` for Node 18+, rode:

```bash
nodejs bin/orquestrador-maestro.js health local
```

Se também for antigo, instale ou ative uma versão Linux do Node 18+ antes de
continuar.

### Erro: `node` Não Existe

Sinal:

```text
node: command not found
```

Tente:

```bash
nodejs -p "process.platform + ' ' + process.version"
```

Se funcionar, use `nodejs` no lugar de `node` ou crie um alias temporário:

```bash
alias node="nodejs"
hash -r
```

Se `nodejs` também não existir, instale Node 18+ no Ubuntu/WSL antes de
continuar.

## 3.1. Garantir Que O NPM Tambem E Do Linux

Alguns comandos usam `npm`. Se o `npm` chamado for do Windows, você pode cair no
mesmo problema de `CMD.EXE` e caminho UNC.

### Passo

```bash
which npm
npm -v
```

O caminho ideal deve ser Linux, por exemplo:

```text
/usr/bin/npm
```

ou:

```text
/home/<usuario>/.local/bin/npm
```

### Erro: NPM Do Windows

Sinal:

```text
/mnt/c/Program Files/nodejs/npm
```

Correção para testes pontuais: evite `npm run ...` e rode o script direto com
Node Linux:

```bash
/usr/bin/node scripts/test-live-sandboxes.js
```

Correção prática do terminal:

```bash
alias node="/usr/bin/node"
alias npm="/usr/bin/npm"
hash -r
```

Se `/usr/bin/npm` não existir, instale o npm Linux ou use o Node local do
usuário se ele fornecer `npm`.

## 3.2. Tornar O Node Linux Padrao No Terminal

Os aliases acima valem só para o terminal atual. Para persistir, edite
`~/.bashrc`.

Antes, confirme o caminho correto:

```bash
command -v node
node -p "process.platform"
```

Se mostrar `linux`, adicione ao `~/.bashrc` apenas se necessário:

```bash
echo 'alias node="/usr/bin/node"' >> ~/.bashrc
echo 'alias npm="/usr/bin/npm"' >> ~/.bashrc
source ~/.bashrc
```

Não adicione alias para um caminho que não existe.

## 4. Conferir Estado Do Git

### Passo

```bash
git status --short
```

O ideal antes de configurar uso local:

```text

```

Ou seja: sem saída.

### Erro: Aparecem Muitos Arquivos Modificados

Não rode `git reset --hard`.

Diagnóstico:

```bash
git status --short
git diff --stat
```

Se você não sabe de onde vieram as mudanças, pare e revise antes. Arquivos em
`.local/`, `.omx/`, `DEV/`, logs e caches devem estar ignorados pelo Git.

### Erro: `git` Não Existe

Sinal:

```text
git: command not found
```

Instale Git no Ubuntu/WSL, não use Git do Windows para este fluxo:

```bash
sudo apt update
sudo apt install git
```

Depois confirme:

```bash
git --version
```

## 5. Rodar Health Local

### Passo

```bash
node bin/orquestrador-maestro.js health local
```

Se o Node estiver ambíguo, use explicitamente:

```bash
/usr/bin/node bin/orquestrador-maestro.js health local
```

O esperado:

```text
Local health passed.
ok      validate
ok      git-status
ok      catalog-consistency
```

### Erro: `fail validate` Com `C:\Windows\scripts\run-validate.js`

Causa: Node do Windows foi chamado.

Correção:

```bash
/usr/bin/node bin/orquestrador-maestro.js health local
```

Depois corrija o alias/PATH conforme a seção 3.

### Erro: `fail git-status`

Causa provável: existem mudanças não commitadas ou arquivos inesperados.

Diagnóstico:

```bash
git status --short
```

Se aparecer apenas arquivo local privado ignorado, ele não deve aparecer no Git.
Se aparecer arquivo sensível rastreado ou não rastreado, não commite. Mova para
`.local/` ou remova com cuidado.

### Erro: `catalog-consistency`

Causa provável: skills em `orquestrador/skills` e `codex/skills` ficaram fora de
sincronia.

Correção inicial:

```bash
node bin/orquestrador-maestro.js validate --check-sync
```

Leia a mensagem. Se ela indicar skill faltando em um lado, rode o fluxo de sync
do projeto ou copie a skill para o espelho correto.

## 6. Rodar Setup Local

O setup instala/sincroniza o Orquestrador no home do usuário e roda validações.

### Passo Seguro Primeiro

```bash
node bin/orquestrador-maestro.js setup local --dry-run --json
```

Se passar, rode o real:

```bash
node bin/orquestrador-maestro.js setup local
```

### O Que Esperar

O comando pode imprimir muitas linhas, especialmente sincronizando skills para
várias ferramentas.

Pode demorar alguns minutos.

### Erro: Parece Travado

Antes de concluir que travou, espere. O sync pode ser longo.

Se estiver usando ferramenta com timeout curto, rode no terminal manualmente:

```bash
node bin/orquestrador-maestro.js setup local
```

Se precisar diagnosticar sem alterar nada:

```bash
node bin/orquestrador-maestro.js setup local --dry-run --json
```

Se o comando real passar de alguns minutos mas ainda estiver imprimindo linhas
de skills com `ok` ou `applied`, ele ainda está trabalhando. Não feche o
terminal no meio, a menos que esteja realmente parado por muito tempo sem saída.

### Erro: Permissão Ao Escrever No Home

Sinal:

```text
permission denied
EACCES
```

Causa provável: arquivos criados anteriormente como root.

Correção:

```bash
sudo chown -R "$USER:$USER" "$HOME/.orquestrador" "$HOME/.codex" "$HOME/.agents" 2>/dev/null || true
```

Depois rode novamente:

```bash
node bin/orquestrador-maestro.js setup local
```

### Erro: PowerShell Ausente

No WSL/Linux, o instalador deve usar shell Linux. Se alguma etapa pedir
PowerShell, confirme que você está no Ubuntu/WSL e não no CMD/PowerShell.

Diagnóstico:

```bash
uname -a
which bash
```

## 7. Abrir O Painel Local

### Caminho Mais Facil Pelo Windows

No PowerShell do Windows, a partir da pasta do projeto ou informando a distro:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-orquestrador.ps1
```

Se sua distro WSL não se chama `Ubuntu`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-orquestrador.ps1 -Distro <nome_da_distro>
```

Esse script roda diagnóstico no WSL, inicia o servidor local e abre
`http://127.0.0.1:8787/setup` no navegador.

### Passo

No terminal WSL:

```bash
node bin/orquestrador-maestro.js server start --port 8787
```

Esse comando fica rodando e não devolve o prompt. Isso é normal. Para continuar
usando o terminal, abra outro terminal Ubuntu/WSL.

Abra no navegador do Windows:

```text
http://127.0.0.1:8787
```

### Erro: Porta Em Uso

Sinal:

```text
EADDRINUSE
```

Correção: use outra porta.

```bash
node bin/orquestrador-maestro.js server start --port 8788
```

Abra:

```text
http://127.0.0.1:8788
```

### Erro: Navegador Não Abre

Diagnóstico:

```bash
curl http://127.0.0.1:8787/status
```

Se o `curl` responder JSON, o servidor está ok. O problema é navegador/endereço.

Se não responder, confira se o comando do servidor ainda está rodando.

### Erro: `curl` Não Existe

Sinal:

```text
curl: command not found
```

Instale no Ubuntu/WSL:

```bash
sudo apt update
sudo apt install curl
```

### Observação Importante

O painel é local e seguro por padrão. Ele mostra readiness, runs, fila, métricas
e audit log. Ele não deve enviar WhatsApp, chamar LLM real ou disparar webhook
externo sozinho.

### Como Interpretar O Painel

- `Status: Pronto`: o baseline local está saudável.
- `Skills`: catálogo carregado.
- `Connectors mock: ok`: adapters de teste locais funcionam.
- `live-webhook/live-n8n/live-whatsapp/live-llm: disabled`: normal até configurar
  env vars, dry-run, confirmação e live HTTP.
- `Readiness: 0 prontos, 4 bloqueados`: normal em instalação nova sem credenciais.
- `Runs: Nenhum item`: você ainda não criou execuções locais.
- `Fila: 0 tarefas`: nada foi enfileirado.
- `Audit Log: Nenhum item`: nenhum evento auditável foi gerado ainda.

Não trate `live_adapter_disabled` como erro de instalação. É uma trava de
segurança.

## 8. Criar Config Local Privada

O caminho mais fácil é usar o wizard web:

```bash
node bin/orquestrador-maestro.js server start --port 8787
```

Abra:

```text
http://127.0.0.1:8787/setup
```

Na tela de setup:

1. Clique em `Verificar` para diagnosticar o ambiente.
2. Preencha WhatsApp e/ou LLM.
3. Clique em `Salvar Config Local`.
4. Clique em `Verificar WhatsApp` ou `Verificar LLM`.
5. Clique em `Dry-Run WhatsApp` ou `Dry-Run LLM`.

O wizard salva em `.local/orquestrador/config.json` e `.local/live.env`.
Ele não faz envio real. Envio real continua sendo feito por CLI com confirmação
explícita.

Por segurança, o wizard não preenche token, chave, telefone, destinatário ou
endpoint bruto de volta na tela. Quando algo já existe em `.local/live.env`, ele
mostra o campo como configurado e muda o placeholder para indicar isso.

Se preferir configurar manualmente, siga os passos abaixo.

### Passo

```bash
mkdir -p .local/orquestrador
nano .local/orquestrador/config.json
```

Cole:

```json
{
  "schemaVersion": 1,
  "adapters": {
    "whatsapp": {
      "tokenEnv": "ORQUESTRADOR_WHATSAPP_TOKEN",
      "phoneIdEnv": "ORQUESTRADOR_WHATSAPP_PHONE_ID",
      "endpointEnv": "ORQUESTRADOR_WHATSAPP_API_URL",
      "allowedHosts": ["graph.facebook.com"]
    },
    "llm": {
      "provider": "local",
      "apiKeyEnv": "ORQUESTRADOR_LLM_API_KEY",
      "endpointEnv": "ORQUESTRADOR_LLM_API_URL",
      "allowedHosts": ["127.0.0.1", "localhost"]
    }
  }
}
```

Salve no `nano`:

1. `Ctrl+O`
2. Enter
3. `Ctrl+X`

### Se Voce Nao Sabe Usar `nano`

Opção simples com `cat`. Copie o bloco inteiro:

```bash
mkdir -p .local/orquestrador
cat > .local/orquestrador/config.json <<'JSON'
{
  "schemaVersion": 1,
  "adapters": {
    "whatsapp": {
      "tokenEnv": "ORQUESTRADOR_WHATSAPP_TOKEN",
      "phoneIdEnv": "ORQUESTRADOR_WHATSAPP_PHONE_ID",
      "endpointEnv": "ORQUESTRADOR_WHATSAPP_API_URL",
      "allowedHosts": ["graph.facebook.com"]
    },
    "llm": {
      "provider": "local",
      "apiKeyEnv": "ORQUESTRADOR_LLM_API_KEY",
      "endpointEnv": "ORQUESTRADOR_LLM_API_URL",
      "allowedHosts": ["127.0.0.1", "localhost"]
    }
  }
}
JSON
```

Valide:

```bash
node bin/orquestrador-maestro.js config validate
node bin/orquestrador-maestro.js config explain
```

### Erro: JSON Inválido

Sinal:

```text
Unexpected token
JSON
```

Causa comum:

- vírgula sobrando;
- aspas faltando;
- comentário dentro do JSON.

Correção: gere um exemplo limpo:

```bash
node bin/orquestrador-maestro.js config example
```

Compare com seu arquivo.

### Erro: Segredo Dentro Do Arquivo

Sinal:

```text
secret-like values must be referenced by env var name
```

Causa: você colocou token real dentro do JSON.

Errado:

```json
"tokenEnv": "EAA..."
```

Certo:

```json
"tokenEnv": "ORQUESTRADOR_WHATSAPP_TOKEN"
```

O valor real fica em variável de ambiente, não no JSON.

### Erro: `nano` Não Existe

Sinal:

```text
nano: command not found
```

Use o método com `cat` acima ou instale:

```bash
sudo apt update
sudo apt install nano
```

## 9. Criar Arquivo Local De Variáveis

### Passo

```bash
nano .local/live.env
```

Cole com placeholders:

```bash
export ORQUESTRADOR_WHATSAPP_TOKEN="<token_da_meta>"
export ORQUESTRADOR_WHATSAPP_PHONE_ID="<phone_number_id_da_meta>"
export ORQUESTRADOR_WHATSAPP_API_URL="https://graph.facebook.com/<versao>/<phone_number_id_da_meta>/messages"
export ORQUESTRADOR_WHATSAPP_SANDBOX_RECIPIENT="<numero_destino_sem_plus>"

export ORQUESTRADOR_LLM_API_KEY="<chave_do_gateway_llm>"
export ORQUESTRADOR_LLM_API_URL="http://127.0.0.1:<porta>/<endpoint>"
```

Carregue:

```bash
source .local/live.env
```

Se você fechar o terminal, precisa carregar de novo. Variáveis de ambiente não
ficam globais para todos os terminais automaticamente.

Confirme sem imprimir segredos:

```bash
test -n "$ORQUESTRADOR_WHATSAPP_TOKEN" && echo "whatsapp token configurado"
test -n "$ORQUESTRADOR_WHATSAPP_PHONE_ID" && echo "phone id configurado"
test -n "$ORQUESTRADOR_WHATSAPP_API_URL" && echo "whatsapp endpoint configurado"
```

### Erro: Variável Não Fica Configurada

Sinal:

```bash
echo "$ORQUESTRADOR_WHATSAPP_API_URL"
```

não imprime nada.

Correção:

```bash
source .local/live.env
```

Se abrir um novo terminal, precisa rodar `source .local/live.env` novamente.

### Erro: `source` Falha Por Aspas Ou Caracter Especial

Sinal:

```text
unexpected EOF
syntax error
```

Causa: alguma linha de `.local/live.env` tem aspas sem fechar ou caracteres
colados fora das aspas.

Abra o arquivo:

```bash
nano .local/live.env
```

Cada linha deve seguir este padrão:

```bash
export NOME_DA_VARIAVEL="valor"
```

Não coloque espaço antes ou depois do `=`.

Errado:

```bash
export ORQUESTRADOR_WHATSAPP_TOKEN = "valor"
```

Certo:

```bash
export ORQUESTRADOR_WHATSAPP_TOKEN="valor"
```

### Erro: Arquivo Aparece No Git

Diagnóstico:

```bash
git status --short
```

Se aparecer `.local/live.env`, pare. Esse arquivo deve ser privado.

Correção:

```bash
git check-ignore -v .local/live.env
```

Se não estiver ignorado, não commite. Ajuste `.gitignore` antes.

## 10. Configurar WhatsApp Cloud API

Você precisa obter na Meta:

- Access Token.
- Phone Number ID.
- Versão da Graph API.
- Número destinatário autorizado no sandbox ou conversa/template válido.

Onde pegar, em termos práticos:

1. Acesse o painel Meta Developers.
2. Abra o app que tem o produto WhatsApp.
3. Entre em WhatsApp/API Setup ou seção equivalente.
4. Copie o `Phone Number ID`.
5. Gere/copiei o `Access Token`.
6. Veja a versão da Graph API usada pela URL exibida pela Meta.

Não confunda:

- telefone visível: número como `+55...`;
- `Phone Number ID`: número/ID interno da Meta usado na URL;
- destinatário: número que vai receber a mensagem, sem `+`.

Importante: `Phone Number ID` não é o telefone. É um identificador interno da
Meta.

Endpoint:

```text
https://graph.facebook.com/<versao>/<phone_number_id>/messages
```

Destinatário:

```text
<codigo_pais><ddd><numero>
```

Sem `+`, sem espaço, sem parênteses.

Exemplo de formato, sem ser um número real:

```text
5511999999999
```

### Passo 1: Check

```bash
node bin/orquestrador-maestro.js whatsapp check --json
```

Se você acabou de abrir outro terminal, rode antes:

```bash
source .local/live.env
```

Esperado:

```json
"mode": "live-ready"
```

### Erro: `live-disabled`

Causa: faltam env vars ou config.

Diagnóstico:

```bash
node bin/orquestrador-maestro.js whatsapp check --json
```

Veja `missingConfig`.

Correções comuns:

```bash
source .local/live.env
node bin/orquestrador-maestro.js config validate
```

Confirme que o nome das variáveis no JSON é igual ao nome exportado em
`.local/live.env`.

### Passo 2: Dry-Run

```bash
node bin/orquestrador-maestro.js whatsapp dry-run \
  --recipient "$ORQUESTRADOR_WHATSAPP_SANDBOX_RECIPIENT" \
  --body "Teste local do Orquestrador Maestro" \
  --idempotency-key "wa-test-001" \
  --consent \
  --confirm-external \
  --json
```

O dry-run não envia mensagem. Ele apenas valida política, consentimento,
idempotência e payload redigido.

### Erro: `consent-required`

Adicione:

```text
--consent
```

Não use envio real sem consentimento do destinatário.

### Erro: `external-confirmation-required`

Adicione:

```text
--confirm-external
```

Essa trava evita envio externo acidental.

### Passo 3: Envio Real

Só rode depois do `check` e do `dry-run` passarem.

Antes do envio real, confirme:

```bash
echo "$ORQUESTRADOR_WHATSAPP_API_URL"
echo "$ORQUESTRADOR_WHATSAPP_SANDBOX_RECIPIENT"
```

Não imprima o token no terminal.

```bash
node bin/orquestrador-maestro.js whatsapp send \
  --recipient "$ORQUESTRADOR_WHATSAPP_SANDBOX_RECIPIENT" \
  --body "Teste local do Orquestrador Maestro" \
  --idempotency-key "wa-test-001" \
  --consent \
  --confirm-external \
  --enable-live-http \
  --json
```

### Erro: `live_http_disabled`

Faltou:

```text
--enable-live-http
```

Essa trava é proposital. Sem ela, nada sai para a internet.

### Erro: Host Não Permitido

Sinal:

```text
Host not allowed for egress
```

Causa: o host do endpoint não está em `allowedHosts`.

Para WhatsApp Cloud API, o host esperado é:

```json
"allowedHosts": ["graph.facebook.com"]
```

### Erro Meta: Token Inválido Ou Sem Permissão

Sinais possíveis no JSON de resposta redigido:

```text
OAuthException
permission
access token
```

Correções:

- verifique se o token não expirou;
- confirme permissões de WhatsApp no app Meta;
- confirme se o número está associado ao app;
- confirme se está usando o `Phone Number ID`, não o telefone.

### Erro Meta: Destinatário Não Autorizado

No sandbox/teste da Meta, o destinatário precisa estar autorizado.

Correções:

- adicione o número como destinatário de teste na Meta;
- envie primeiro a mensagem exigida pelo sandbox, se houver;
- para produção, use template aprovado ou conversa dentro da janela permitida.

### Erro Meta: Mensagem De Texto Bloqueada Fora Da Janela

O comando atual envia payload de texto. Em produção, a Meta pode exigir template
aprovado quando a conversa não está dentro da janela permitida.

Mitigação:

- teste primeiro com destinatário sandbox autorizado;
- para produção, prepare templates aprovados na Meta;
- não use envio real em massa até validar uma conversa controlada.

### Erro: Idempotency Key Repetida

Se você repetir o mesmo comando com a mesma chave, alguns sistemas podem tratar
como duplicata.

Use uma chave nova por tentativa real:

```bash
--idempotency-key "wa-test-$(date +%Y%m%d-%H%M%S)"
```

## 11. Configurar LLM Live

Se ainda não existe um gateway LLM local, pule esta seção. O Orquestrador pode
usar provider mock para testes locais.

Um gateway LLM é um serviço HTTP que recebe uma requisição do Orquestrador e
encaminha para um provedor de modelo. Sem esse serviço ou endpoint, `llm
live-check` deve continuar `live-disabled`.

### Passo 1: Configurar Env

No `.local/live.env`:

```bash
export ORQUESTRADOR_LLM_API_KEY="<chave>"
export ORQUESTRADOR_LLM_API_URL="http://127.0.0.1:<porta>/<endpoint>"
```

Carregue:

```bash
source .local/live.env
```

### Passo 2: Check

```bash
node bin/orquestrador-maestro.js llm live-check --json
```

Se você só quer testar roteamento sem rede, use o mock:

```bash
node bin/orquestrador-maestro.js llm providers
node bin/orquestrador-maestro.js llm explain-routing --prompt "teste"
```

### Erro: `live-disabled`

Causa: falta `ORQUESTRADOR_LLM_API_KEY`, `ORQUESTRADOR_LLM_API_URL` ou config
local.

Diagnóstico:

```bash
node bin/orquestrador-maestro.js config explain
```

### Passo 3: Dry-Run

```bash
node bin/orquestrador-maestro.js llm dry-run \
  --prompt "Responda apenas: ok" \
  --budget 1 \
  --idempotency-key "llm-test-001" \
  --confirm-external \
  --json
```

### Passo 4: Chamada Real

```bash
node bin/orquestrador-maestro.js llm complete \
  --prompt "Responda apenas: ok" \
  --budget 1 \
  --idempotency-key "llm-test-001" \
  --confirm-external \
  --enable-live-http \
  --json
```

### Erro: Endpoint Local Não Responde

Diagnóstico:

```bash
curl "$ORQUESTRADOR_LLM_API_URL"
```

Se não responder, o gateway LLM não está rodando ou a URL está errada.

Se seu endpoint só aceita `POST`, o `curl` simples pode retornar erro HTTP. Isso
ainda prova que há algo escutando. Para testar POST:

```bash
curl -X POST "$ORQUESTRADOR_LLM_API_URL" \
  -H "content-type: application/json" \
  -d '{"prompt":"teste"}'
```

### Erro: Host Não Permitido

Se usar gateway local, mantenha:

```json
"allowedHosts": ["127.0.0.1", "localhost"]
```

Se usar outro host, adicione explicitamente o host em `allowedHosts`.

## 12. Rodar Testes Sandbox Opt-In

Esses testes ficam fora do `npm test`. Eles só rodam quando você habilita por
env var.

### Sem Envio Real

```bash
ORQUESTRADOR_ENABLE_WHATSAPP_SANDBOX_TESTS=1 \
ORQUESTRADOR_ENABLE_LLM_SANDBOX_TESTS=1 \
npm run test:live-sandbox
```

Se faltar env var, o teste deve explicar qual está faltando.

Importante: esse comando ainda não envia de verdade sem
`ORQUESTRADOR_LIVE_SANDBOX_SEND=1`.

### Com Envio Real

Só depois de tudo validado:

```bash
ORQUESTRADOR_ENABLE_WHATSAPP_SANDBOX_TESTS=1 \
ORQUESTRADOR_LIVE_SANDBOX_SEND=1 \
npm run test:live-sandbox
```

Para LLM:

```bash
ORQUESTRADOR_ENABLE_LLM_SANDBOX_TESTS=1 \
ORQUESTRADOR_LIVE_SANDBOX_SEND=1 \
npm run test:live-sandbox
```

### Erro: Teste Pulou

Sinal:

```json
"skipped": true
```

Causa: você não ativou a env var do teste.

Correção:

```bash
ORQUESTRADOR_ENABLE_WHATSAPP_SANDBOX_TESTS=1 npm run test:live-sandbox
```

Se seu `npm` for do Windows, rode direto:

```bash
ORQUESTRADOR_ENABLE_WHATSAPP_SANDBOX_TESTS=1 \
/usr/bin/node scripts/test-live-sandboxes.js
```

### Erro: Missing Env Vars

Sinal:

```text
sandbox missing env vars
```

Correção: edite `.local/live.env`, carregue com `source .local/live.env` e rode
de novo.

## 13. Rotina Diária

Antes de trabalhar:

```bash
cd ~/Projetos/Orquestrador-Maestro
node bin/orquestrador-maestro.js health local
node bin/orquestrador-maestro.js status
```

Ver execuções:

```bash
node bin/orquestrador-maestro.js runs list
```

Ver fila:

```bash
node bin/orquestrador-maestro.js queue list
```

Abrir painel:

```bash
node bin/orquestrador-maestro.js server start --port 8787
```

## 14. Checklist De Diagnóstico Rápido

Quando algo falhar, rode nesta ordem:

```bash
pwd
whoami
which node
node -p "process.execPath + ' ' + process.platform + ' ' + process.version"
git status --short
node bin/orquestrador-maestro.js health local
node bin/orquestrador-maestro.js config validate
```

Interpretação:

- `whoami` não deve ser `root`.
- `process.platform` deve ser `linux`.
- `git status --short` idealmente deve estar limpo.
- `health local` deve passar antes de mexer em WhatsApp/LLM.
- `config validate` deve passar antes de qualquer adapter live.

Se algum comando chamar Windows/CMD, repita o checklist usando `/usr/bin/node`:

```bash
/usr/bin/node bin/orquestrador-maestro.js health local
```

## 15. O Que Nunca Fazer

- Não coloque token real em `docs/`, `README.md`, `package.json`, fixtures ou
  qualquer arquivo rastreado.
- Não rode `git reset --hard` para "limpar" erro sem saber o que será perdido.
- Não use `--enable-live-http` antes de `check` e `dry-run`.
- Não rode envio real sem `--consent`.
- Não rode o projeto como root.
- Não rode pelo caminho `\\wsl.localhost\...` no CMD/PowerShell.

## 16. Ordem Recomendada Para O Primeiro Uso Real

1. Abrir Ubuntu/WSL.
2. Sair de root, se estiver em root.
3. Entrar na pasta do projeto.
4. Confirmar Node Linux.
5. Rodar `health local`.
6. Rodar `setup local --dry-run --json`.
7. Rodar `setup local`.
8. Criar `.local/orquestrador/config.json`.
9. Criar `.local/live.env`.
10. Rodar `source .local/live.env`.
11. Rodar `whatsapp check --json`.
12. Rodar `whatsapp dry-run`.
13. Só então rodar `whatsapp send`.
14. Abrir painel local para acompanhar readiness, fila, runs, métricas e audit
    log.
