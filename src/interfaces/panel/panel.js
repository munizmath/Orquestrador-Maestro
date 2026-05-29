"use strict";

async function getJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
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

async function refresh() {
  const [overview, status, skills, runs, alerts, integrations, connectors, queue, metrics, llm, adapters, actions] = await Promise.all([
    getJson("/overview"),
    getJson("/status"),
    getJson("/skills"),
    getJson("/runs"),
    getJson("/alerts"),
    getJson("/integrations"),
    getJson("/connectors"),
    getJson("/queue"),
    getJson("/metrics"),
    getJson("/llm/providers"),
    getJson("/adapters/live"),
    getJson("/actions"),
  ]);

  const readiness = overview.data.readiness;
  setHtml("readiness", `
    <p>${badge(`${readiness.ready} prontos`, readiness.ready > 0)} ${badge(`${readiness.blocked} bloqueados`, readiness.blocked === 0)}</p>
    ${list(readiness.adapters.map((adapter) => `${adapter.ok ? "ok" : "blocked"} ${adapter.code || adapter.id}`))}
  `);
  setHtml("queue-summary", `
    <p>${overview.data.queue.total} tarefas, ${overview.data.queue.pending} pendentes, ${overview.data.queue.running} rodando</p>
    ${list(overview.data.queue.tasks.map((task) => `${task.status} ${task.kind}`))}
  `);
  setHtml("audit-log", list(overview.data.audit.recent.map((event) => `${event.timestamp} ${event.type}: ${event.safeSummary}`)));
  setHtml("status", `<p class="${status.data.ok ? "ok" : "fail"}">${status.data.ok ? "Pronto" : "Requer atenção"}</p><p>${status.data.health.skills} skills, ${status.data.health.runs} runs</p>`);
  setHtml("skills", `<p>${skills.data.count} skills catalogadas</p>${list(Object.entries(skills.data.byRisk).map(([risk, count]) => `${risk}: ${count}`))}`);
  setHtml("runs", list(runs.data.recent.map((run) => `${run.status} ${run.kind}: ${run.summary}`)));
  setHtml("alerts", list(alerts.data.alerts.map((alert) => `${alert.severity}: ${alert.title}`)));
  setHtml("integrations", list(integrations.data.capabilities.map((capability) => `${capability.name} (${capability.mode})`)));
  setHtml("connectors", list(connectors.data.connectors.map((connector) => `${connector.id}: ${connector.healthy ? "ok" : "disabled"}`)));
  setHtml("queue", `<p>${queue.data.tasks.length} tarefas locais</p>`);
  setHtml("metrics", `<p>${metrics.data.runs.total} runs, ${metrics.data.audit.total} eventos</p>`);
  setHtml("llm", list(llm.data.providers.map((provider) => `${provider.name}: ${provider.models.length} modelos mock`)));
  setHtml("adapters", list(adapters.data.adapters.map((adapter) => `${adapter.code}: bloqueado`)));
  setHtml("actions", list(actions.data.actions.map((action) => `${action.label}: ${action.disabledInPanel ? "somente CLI" : "disponível"}`)));
}

document.getElementById("refresh").addEventListener("click", () => {
  refresh().catch((error) => setHtml("status", `<p class="fail">${error.message}</p>`));
});

refresh().catch((error) => setHtml("status", `<p class="fail">${error.message}</p>`));
