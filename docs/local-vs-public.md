# Uso Local E Snapshot Público

O Orquestrador-Maestro pode ser usado como instalação local e como snapshot publicável. Estes modos têm regras diferentes.

## Local-Only

Use local-only para:

- planos em andamento;
- memória operacional em `DEV/`;
- decisões de curadoria ainda não publicáveis;
- testes de novas skills;
- ajustes específicos da máquina ou do usuário.

Arquivos local-only não devem conter segredos mesmo quando ignorados pelo Git. Eles também não devem ser usados como fonte única de uma regra que precisa existir no snapshot.

## Snapshot Público

Use o snapshot público para:

- skills canônicas sanitizadas;
- scripts instaláveis;
- documentação operacional reaproveitável;
- perfis de ferramentas sem dados privados;
- validações e exemplos seguros.

Antes de tratar algo como publicável, rode:

```bash
npm run validate
npm pack --dry-run
```

## Regra Prática

- `DEV/`, `.local/`, `.omx/`, logs, backups e caches são locais.
- `docs/`, `orquestrador/`, `codex/`, `scripts/`, `home/` e `tool-profiles/` precisam permanecer sanitizados.
- Se uma melhoria começou local-only e virou regra estável, mova a convenção para `docs/` ou para uma skill canônica.
