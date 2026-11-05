---
name: skill-webapp-testing
description: Testa aplicações web com Playwright ou ferramenta equivalente, cobrindo fluxos críticos, acessibilidade, estados de erro e regressões visuais.
category: testing
risk: medium
source: orquestrador-native
---

# Web App Testing

Use only against applications the user owns or is authorized to test.

## Workflow

1. Discover the app URL, startup command, test account policy, and allowed origins.
2. Confirm the served Web/API revision and that required auth, fixture, and reset paths actually reach the target state. Keep captures from different revisions separate.
3. Map the affected journey, states, roles, breakpoints, and acceptance criteria; use a full inventory only for a broad audit.
4. Prefer semantic locators and accessibility state over brittle selectors.
5. Exercise relevant success, validation, loading, empty, unauthorized, and failure paths. If a state is unreachable, report `BLOCKED` with the missing fixture or runtime dependency.
6. Capture interaction evidence, screenshots, console errors, network failures, and trace artifacts when useful. An accessibility tree or screenshot is not a real screen-reader test.
7. Clean up test data and avoid sending real messages or payments.
8. Report reproducible steps, revision, artifacts, and the exact level of proof obtained.

Never bypass authorization or test third-party systems without explicit scope.
