# Container De Desenvolvimento

O container do Orquestrador Maestro serve para visualizar e testar a API/painel
local sem montar o home real do usuário. Ele não substitui a instalação no host.

## O Que Fica Dentro Do Container

- runtime Node.js;
- PowerShell para `scripts/validate-public.ps1`;
- API/painel local;
- `.omx` em volume Docker;
- `.local` em volume Docker;
- fixtures e stores temporários de teste.

## O Que Não Entra

- `DEV/`;
- `.local/` do host;
- `.omx/` do host;
- `.env`;
- caches, logs, backups e perfis privados do usuário.

Esses caminhos são excluídos por `.dockerignore`.

## Subir O Painel

```bash
docker compose up -d --build orquestrador
```

Depois abra:

```text
http://127.0.0.1:8787/panel
```

Também é possível abrir o design estático:

```text
http://127.0.0.1:8787/design
```

## Rodar Testes No Container

```bash
docker compose --profile test run --rm test
```

## Derrubar

```bash
docker compose down
```

Para remover também os volumes locais do container:

```bash
docker compose down -v
```

