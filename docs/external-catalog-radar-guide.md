# Como Usar O Radar De Catálogos Externos

O radar registra fontes externas avaliadas para curadoria. Ele não é uma lista de importação.

## Quando Usar

Use `docs/external-catalog-radar.md` quando:

- uma fonte externa aparece repetidamente como referência útil;
- uma integração muda comportamento ou toolset;
- uma nova skill pode absorver padrões de outro catálogo;
- uma fonte deve ser rejeitada explicitamente para evitar importação em massa.

## Como Avaliar

1. Identifique a fonte e o link.
2. Classifique a categoria.
3. Atribua ROI de 1 a 5 usando o plano de curadoria.
4. Liste padrões absorvidos, não arquivos copiados.
5. Liste itens rejeitados.
6. Defina última revisão e próximo passo.

## Regras

- Não importe catálogos inteiros.
- Não copie exemplos que dependam de segredo, conta real ou runtime indisponível.
- Prefira uma melhoria pequena, validável e roteável.
- Mantenha a curadoria `local-only` até o usuário pedir publicação.
- Atualize skills, router, aliases, chains e validação quando a absorção virar comportamento.

## Sinal De Boa Absorção

Uma absorção boa deixa o Orquestrador mais útil sem aumentar muito o contexto:

- skill menor e mais acionável;
- validação mais forte;
- roteamento mais preciso;
- segurança ou idempotência melhores;
- menos prompt repetido pelo usuário.
