"use strict";

async function getJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

async function postQuery(session, queryName, fields, options = {}) {
  const query = {
    schemaVersion: 1,
    queryName,
    workspaceKey: session.scope.workspaceKey,
    projectKey: session.scope.projectKey,
    actorKey: session.actorContext.actorKey,
    filters: options.filters || {},
    pagination: options.pagination || { limit: 25, offset: 0 },
    fields,
    purpose: options.purpose || "panel.read",
  };
  const response = await fetch("/query", {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-omx-session": session.actorContext.sessionKey,
      "x-omx-roles": session.actorContext.roles.join(","),
    },
    body: JSON.stringify(query),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${queryName}: ${payload.data && payload.data.denial ? payload.data.denial.reasonCode : response.status}`);
  return payload;
}

function setHtml(id, html) {
  document.getElementById(id).innerHTML = html;
}

function list(items) {
  if (!items || items.length === 0) return "<p>Nenhum item.</p>";
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function badge(text, ok) {
  return `<span class="badge ${ok ? "badge-ok" : "badge-blocked"}">${text}</span>`;
}

function statusText(value) {
  const map = {
    ok: "pronto",
    blocked: "bloqueado",
    disabled: "desativado",
    failed: "falhou",
    pending: "pendente",
    running: "em andamento",
    succeeded: "concluído",
    ready: "pronto",
    "live-disabled": "envio real bloqueado",
    "local-dry-run": "teste local",
    "local-dry-run-or-live": "teste local ou envio real autorizado",
  };
  return map[value] || value || "sem informação";
}

function riskText(value) {
  const map = { high: "alto impacto", medium: "impacto médio", low: "baixo impacto" };
  return map[value] || value;
}

function actionText(action) {
  const labels = {
    "adapter.check": "Verificar conector",
    "adapter.dryRun": "Simular ação sem enviar nada",
    "adapter.execute": "Executar ação",
  };
  return labels[action.actionKey || action.id] || action.label || "Ação";
}

function capabilityText(value) {
  const map = {
    "message.preview": "Pré-visualizar mensagem",
    "message.send": "Enviar mensagem",
    "webhook.emit": "Acionar webhook",
    "llm.complete": "Pedir resposta para a IA",
    "workflow.trigger": "Iniciar fluxo de automação",
    "workflow.status": "Consultar fluxo de automação",
  };
  return map[value] || value;
}

async function refresh() {
  const session = (await getJson("/query/scope")).data;
  const [overview, status, skills, runs, alerts, integrations, connectors, queue, metrics, llm, adapters, actions, insights] = await Promise.all([
    postQuery(session, "cockpit.overview.get", ["schemaVersion", "status", "readiness", "queue", "metrics", "audit"]),
    postQuery(session, "cockpit.summary.get", ["schemaVersion", "ok", "mode", "health", "issues", "warnings", "nextActions"]),
    postQuery(session, "skills.routes.search", ["schemaVersion", "count", "byRisk", "skills"], { pagination: { limit: 100, offset: 0 } }),
    postQuery(session, "runs.timeline.list", ["schemaVersion", "count", "recent"]),
    postQuery(session, "alerts.list", ["schemaVersion", "count", "alerts"]),
    postQuery(session, "integrations.capabilities.list", ["schemaVersion", "capabilities"]),
    postQuery(session, "connectors.list", ["schemaVersion", "connectors"]),
    postQuery(session, "queue.tasks.list", ["schemaVersion", "tasks", "count"]),
    postQuery(session, "metrics.summary.get", ["schemaVersion", "runs", "audit"]),
    postQuery(session, "llm.providers.list", ["schemaVersion", "providers", "checks"]),
    postQuery(session, "adapters.live.list", ["schemaVersion", "adapters"]),
    postQuery(session, "actions.list", ["schemaVersion", "actions"]),
    postQuery(session, "insights.snapshot.get", ["schemaVersion", "runs", "skills"]),
  ]);

  const readiness = overview.data.readiness;
  setHtml("readiness", `
    <p>${badge(`${readiness.ready} prontos`, readiness.ready > 0)} ${badge(`${readiness.blocked} bloqueados`, readiness.blocked === 0)}</p>
    ${list(readiness.adapters.map((adapter) => `${adapter.ok ? "Pronto" : "Bloqueado"}: ${statusText(adapter.code || adapter.adapterKey)}`))}
  `);
  setHtml("queue-summary", `
    <p>${overview.data.queue.total} tarefas, ${overview.data.queue.pending} pendentes, ${overview.data.queue.running} em andamento</p>
    ${list(overview.data.queue.tasks.map((task) => `${statusText(task.status)}: ${task.kind}`))}
  `);
  setHtml("audit-log", list(overview.data.audit.recent.map((event) => `${event.timestamp}: ${event.safeSummary || statusText(event.type)}`)));
  setHtml("status", `<p class="${status.data.ok ? "ok" : "fail"}">${status.data.ok ? "Tudo pronto" : "Precisa de atenção"}</p><p>${status.data.health.skills} habilidades, ${status.data.health.runs} execuções registradas</p>`);
  setHtml("skills", `<p>${skills.data.count} habilidades catalogadas</p>${list(Object.entries(skills.data.byRisk).map(([risk, count]) => `${riskText(risk)}: ${count}`))}`);
  setHtml("runs", list(runs.data.recent.map((run) => `${statusText(run.status)}: ${run.summary || run.kind}`)));
  setHtml("alerts", list(alerts.data.alerts.map((alert) => `${statusText(alert.severity)}: ${alert.title}`)));
  setHtml("integrations", list(integrations.data.capabilities.map((capability) => `${capabilityText(capability.name)} (${statusText(capability.mode)})`)));
  setHtml("connectors", list(connectors.data.connectors.map((connector) => `${connector.connectorKey}: ${connector.healthy ? "pronto" : "desativado"}`)));
  setHtml("queue", `<p>${queue.data.tasks.length} tarefas locais</p>`);
  setHtml("metrics", `<p>${insights.data.runs.total} execuções, ${metrics.data.audit.total} eventos de segurança</p>`);
  setHtml("llm", list(llm.data.providers.map((provider) => `${provider.name}: ${provider.models.length} modelos locais`)));
  setHtml("adapters", list(adapters.data.adapters.map((adapter) => `${statusText(adapter.code)}: bloqueado por segurança`)));
  setHtml("actions", list(actions.data.actions.map((action) => `${actionText(action)}: ${action.disabledInPanel ? "somente pelo terminal" : "disponível no painel"}`)));
}

document.getElementById("refresh").addEventListener("click", () => {
  refresh().catch((error) => setHtml("status", `<p class="fail">${error.message}</p>`));
});

refresh().catch((error) => setHtml("status", `<p class="fail">${error.message}</p>`));
