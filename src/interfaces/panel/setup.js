"use strict";

const form = document.getElementById("setup-form");
const result = document.getElementById("result");
let commands = {};

function dataFromForm() {
  return Object.fromEntries(new FormData(form).entries());
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function setResult(value) {
  result.textContent = typeof value === "string" ? value : safeJson(value);
}

function applyFieldHints(fields = {}) {
  for (const [name, state] of Object.entries(fields)) {
    const input = form.elements.namedItem(name);
    if (!input || !state) continue;
    if (state.value && !input.value) input.value = state.value;
    if (state.fieldHint) input.placeholder = state.fieldHint;
    input.dataset.configured = state.configured ? "true" : "false";
  }
}

function friendlyIssue(issue) {
  const messages = {
    cwd_check_failed: "Abra o terminal na pasta do projeto antes de rodar comandos.",
    user_check_failed: "Use o usuário normal do WSL, não root.",
    node_check_failed: "O Node precisa ser Linux e versão 18 ou superior.",
    npm_check_failed: "O npm precisa ser do Linux. Se ele chamar Windows, use /usr/bin/node para scripts.",
    git_check_failed: "Instale ou corrija o Git no Ubuntu/WSL.",
    curl_check_failed: "Instale curl se quiser diagnosticar endpoints HTTP.",
    config_check_failed: "A configuração local está inválida.",
    local_config_missing: "Salve a configuração local por esta tela.",
    local_env_missing: "Salve o arquivo local de variáveis por esta tela.",
    local_env_incomplete: "Ainda faltam variáveis. Preencha os campos ausentes e salve novamente.",
  };
  return messages[issue.code] || issue.message || issue.code;
}

function list(items) {
  if (!items || items.length === 0) return "<p>Nenhum item.</p>";
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function checkName(name) {
  const map = {
    cwd: "Pasta do projeto",
    user: "Usuário do terminal",
    node: "Node.js",
    npm: "npm",
    git: "Git",
    curl: "curl",
    config: "Configuração local",
  };
  return map[name] || name;
}

function envName(name) {
  const map = {
    ORQUESTRADOR_WHATSAPP_TOKEN: "Token do WhatsApp",
    ORQUESTRADOR_WHATSAPP_PHONE_ID: "ID do número do WhatsApp",
    ORQUESTRADOR_WHATSAPP_API_URL: "Endereço da API da Meta",
    ORQUESTRADOR_LLM_API_KEY: "Chave da IA",
    ORQUESTRADOR_LLM_API_URL: "Endereço da API da IA",
  };
  return map[name] || name;
}

async function getJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw body;
  return body;
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json();
  if (!response.ok) throw parsed;
  return parsed;
}

async function refresh() {
  const status = await getJson("/setup/status");
  commands = status.data.commands || {};
  const checks = (status.data.doctor && status.data.doctor.checks) || [];
  const env = status.data.env || { variables: [], missing: [] };
  applyFieldHints(status.data.fields || {});
  document.getElementById("doctor").innerHTML = `
    <p class="${status.data.ok ? "ok" : "fail"}">${status.data.ok ? "Pronto" : "Atenção necessária"}</p>
    ${list(checks.map((check) => `${check.ok ? "Pronto" : "Precisa ajustar"}: ${checkName(check.name)}`))}
  `;
  document.getElementById("next-actions").innerHTML = list(
    status.data.issues && status.data.issues.length
      ? status.data.issues.map(friendlyIssue)
      : ["Salvar a configuração local", "Verificar WhatsApp e IA", "Simular antes de qualquer envio real"]
  );
  document.getElementById("config-status").innerHTML = `
    <p>Arquivo de configuração: ${status.data.doctor.config.exists ? "encontrado" : "ainda não criado"}</p>
    <p>Arquivo de variáveis locais: ${env.exists ? "encontrado" : "ainda não criado"}</p>
    <p>${env.configured || 0} variáveis configuradas, ${(env.missing || []).length} faltando</p>
    ${list((env.variables || []).map((item) => `${envName(item.envName)}: ${item.inProcess || item.inEnvFile ? "configurada" : "faltando"}`))}
  `;
}

async function action(path, extra = {}) {
  try {
    const payload = { ...dataFromForm(), ...extra };
    const response = await postJson(path, payload);
    setResult(response);
    await refresh();
  } catch (error) {
    setResult(error);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  action("/setup/config");
});

document.getElementById("refresh").addEventListener("click", () => {
  refresh().catch(setResult);
});

document.getElementById("support-report").addEventListener("click", async () => {
  try {
    const report = await getJson("/setup/report");
    setResult(report);
  } catch (error) {
    setResult(error);
  }
});

for (const button of document.querySelectorAll(".copy-command")) {
  button.addEventListener("click", async () => {
    const value = commands[button.dataset.command] || "";
    if (!value) {
      setResult("Comando ainda não disponível. Clique em Verificar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setResult(`Comando copiado:\n\n${value}`);
    } catch {
      setResult(`Copie manualmente:\n\n${value}`);
    }
  });
}

document.getElementById("whatsapp-check").addEventListener("click", () => {
  action("/setup/whatsapp/check");
});

document.getElementById("whatsapp-dry-run").addEventListener("click", () => {
  action("/setup/whatsapp/dry-run", { consent: true, confirmExternal: true });
});

document.getElementById("llm-check").addEventListener("click", () => {
  action("/setup/llm/check");
});

document.getElementById("llm-dry-run").addEventListener("click", () => {
  action("/setup/llm/dry-run", { confirmExternal: true });
});

refresh().catch(setResult);
