/* ============================================================
   PAINEL — dados + ícones
   ============================================================ */

function Icon({ name, style, cls }) {
  const p = { width: "1em", height: "1em", viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", style, className: cls };
  const I = {
    baton:    <g><path d="M5 19L19 5"/><circle cx="6.5" cy="17.5" r="2.2"/></g>,
    grid:     <g><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></g>,
    skills:   <g><path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5L12 3z"/></g>,
    plug:     <g><path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 01-10 0V8zM12 16v6"/></g>,
    activity: <g><path d="M3 12h4l3 8 4-16 3 8h4"/></g>,
    list:     <g><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></g>,
    refresh:  <g><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"/></g>,
    check:    <g><path d="M20 6L9 17l-5-5"/></g>,
    x:        <g><path d="M6 6l12 12M18 6L6 18"/></g>,
    alert:    <g><path d="M12 9v4M12 17h.01M10.3 3.9L2.2 18a2 2 0 001.7 3h16.2a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></g>,
    clock:    <g><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></g>,
    bolt:     <g><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></g>,
    cpu:      <g><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></g>,
    lock:     <g><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></g>,
    shield:   <g><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></g>,
    play:     <g><path d="M6 4l14 8-14 8V4z"/></g>,
    wand:     <g><path d="M15 4V2M15 10V8M9 6h2M19 6h2M17.8 8.8l1.4 1.4M3 21l9-9M12.5 6.5l1 1"/></g>,
    terminal: <g><path d="M4 5h16v14H4z"/><path d="M8 10l3 2-3 2M13 14h4"/></g>,
    queue:    <g><rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/></g>,
    chart:    <g><path d="M4 20V4M4 20h16M8 16v-4M13 16V8M18 16v-6"/></g>,
    book:     <g><path d="M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2V5z"/><path d="M18 19H6"/></g>,
    flow:     <g><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M8 16c4 0 4-9 8-9"/></g>,
    msg:      <g><path d="M4 5h16v11H8l-4 4V5z"/></g>,
    menu:     <g><path d="M4 6h16M4 12h16M4 18h16"/></g>,
    dot:      <g><circle cx="12" cy="12" r="3"/></g>,
    arrow:    <g><path d="M5 12h14M13 6l6 6-6 6"/></g>,
    github:   <g><path d="M9 19c-4 1.5-4-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 00-6 0C7.2 3.3 6.1 3.6 6.1 3.6a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004.7 10c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></g>,
  };
  return <svg {...p}>{I[name] || null}</svg>;
}

/* navegação */
const NAV = [
  { id: "overview", label: "Visão geral", icon: "grid" },
  { id: "skills", label: "Habilidades", icon: "skills", count: "25" },
  { id: "connectors", label: "Conectores", icon: "plug", count: "3/7" },
  { id: "runs", label: "Execuções", icon: "activity", count: "0" },
  { id: "audit", label: "Auditoria", icon: "list" },
];

/* skills por nível */
const SKILLS = { total: 25, levels: [
  { k: "alta", c: 4, cls: "" },
  { k: "média", c: 19, cls: "med" },
  { k: "baixa", c: 2, cls: "low" },
] };

/* conectores */
const CONNECTORS = [
  { id: "webhook de teste", kind: "teste local", state: "ok" },
  { id: "n8n de teste", kind: "teste local", state: "ok" },
  { id: "canal de mensagem de teste", kind: "teste local", state: "ok" },
  { id: "webhook real", kind: "envio real", state: "disabled" },
  { id: "n8n real", kind: "envio real", state: "disabled" },
  { id: "WhatsApp real", kind: "envio real", state: "disabled" },
  { id: "IA real", kind: "envio real", state: "disabled" },
];

/* integrações / capacidades */
const CAPS = [
  { n: "Pré-visualizar mensagem", mode: "simulação segura" },
  { n: "Enviar mensagem", mode: "simulação segura" },
  { n: "Acionar webhook", mode: "simulação segura" },
  { n: "Pedir resposta para a IA", mode: "simulação segura" },
  { n: "Iniciar automação", mode: "simulação segura" },
  { n: "Consultar automação", mode: "simulação segura" },
];

/* IA */
const LLM = [
  { n: "IA de teste local", d: "2 modelos de teste", state: "mock" },
  { n: "IA configurada", d: "0 modelos configurados", state: "off" },
];

/* adapters live (bloqueados) */
const ADAPTERS = [
  { n: "Webhook real", reason: "bloqueado por segurança" },
  { n: "n8n real", reason: "bloqueado por segurança" },
  { n: "WhatsApp real", reason: "bloqueado por segurança" },
  { n: "IA real", reason: "bloqueado por segurança" },
];

/* ações */
const ACTIONS = [
  { id: "check", t: "Verificar conectores", d: "confere se está tudo pronto", icon: "shield", state: "disponível", enabled: true,
    toast: "Verificação concluída. Testes locais prontos e envios reais bloqueados por segurança." },
  { id: "generate", t: "Simular ação", d: "testa sem enviar nada para fora", icon: "wand", state: "disponível", enabled: true,
    toast: "Simulação concluída. Nenhuma mudança foi aplicada." },
  { id: "execute", t: "Executar conector", d: "somente pelo terminal", icon: "terminal", state: "somente terminal", enabled: false,
    toast: "" },
];

const READINESS = [
  { n: "Regras globais", v: "ok", d: "contrato base disponível" },
  { n: "Regras do projeto", v: "ok", d: "sobreposição local pronta" },
  { n: "Roteador de habilidades", v: "ok", d: "catálogo indexado" },
  { n: "Verificações automáticas", v: "ok", d: "segurança ativa" },
  { n: "Cópia pública", v: "ok", d: "limpeza de dados requerida" },
];

const SYNC_STATUS = [
  { n: "orquestrador/", v: "sincronizado", state: "ok" },
  { n: "codex/", v: "cópia sanitizada", state: "ok" },
  { n: "biblioteca de habilidades", v: "organizada", state: "mock" },
  { n: "memória local", v: "uso local", state: "blocked" },
];

const SECURITY_SIGNALS = [
  { n: "Tokens", v: "não publicar", state: "blocked" },
  { n: "Logs privados", v: "bloqueados", state: "blocked" },
  { n: "Caminhos locais", v: "sanitizar", state: "blocked" },
  { n: "Memória DEV/", v: "ignorada pelo Git", state: "ok" },
];

const RECENT_EVENTS = [
  { t: "Ambiente pronto para verificação", k: "system", s: "agora" },
  { t: "Envios reais permanecem desabilitados", k: "segurança", s: "local" },
  { t: "Conectores de teste disponíveis para simulação", k: "conector", s: "local" },
  { t: "Publicação exige limpeza de dados sensíveis", k: "auditoria", s: "regra" },
];

const API_ENDPOINTS = {
  overview: "/overview",
  status: "/status",
  skills: "/skills",
  connectors: "/connectors",
  integrations: "/integrations",
  queue: "/queue",
  metrics: "/metrics",
  llm: "/llm/providers",
  actions: "/actions",
  alerts: "/alerts",
};

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function apiCandidates() {
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get("api") || localStorage.getItem("omxPanelApiBase");
  const candidates = [];
  if (explicit) candidates.push(trimSlash(explicit));
  if (window.location.protocol.startsWith("http")) candidates.push(window.location.origin);
  candidates.push("http://127.0.0.1:8787");
  return [...new Set(candidates.filter(Boolean))];
}

async function fetchApiJson(base, endpoint) {
  const response = await fetch(`${base}${endpoint}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${endpoint}: ${response.status}`);
  return response.json();
}

async function loadApiSnapshot() {
  const errors = [];
  for (const base of apiCandidates()) {
    try {
      const entries = await Promise.all(Object.entries(API_ENDPOINTS).map(async ([key, endpoint]) => {
        const payload = await fetchApiJson(base, endpoint);
        return [key, payload.data || payload];
      }));
      localStorage.setItem("omxPanelApiBase", base);
      return {
        ok: true,
        base,
        loadedAt: new Date().toISOString(),
        data: Object.fromEntries(entries),
      };
    } catch (error) {
      errors.push(`${base}: ${error.message}`);
    }
  }
  return {
    ok: false,
    base: null,
    loadedAt: new Date().toISOString(),
    data: {},
    error: errors[0] || "API local indisponível",
  };
}

function riskLabel(risk) {
  return ({ high: "alta", medium: "média", low: "baixa" })[risk] || risk;
}

function connectorLabel(value) {
  const map = {
    "local-webhook-dry-run": "Webhook de teste",
    "local-n8n-dry-run": "n8n de teste",
    "local-message-dry-run": "Mensagens de teste",
    "live-webhook": "Webhook real",
    "live-n8n": "n8n real",
    "live-whatsapp": "WhatsApp real",
    "live-llm": "IA real",
  };
  return map[value] || value;
}

function modeLabel(value) {
  const map = {
    mock: "teste local",
    "local-dry-run": "teste local",
    "live-disabled": "envio real bloqueado",
    "local-only": "uso local",
    disabled: "bloqueado",
    ok: "pronto",
  };
  return map[value] || value;
}

function snapshotSkills(snapshot) {
  const skills = snapshot?.data?.skills;
  if (!skills) return SKILLS;
  const byRisk = skills.byRisk || {};
  return {
    total: skills.count || 0,
    list: skills.skills || [],
    levels: ["high", "medium", "low"].map((risk) => ({
      k: riskLabel(risk),
      c: byRisk[risk] || 0,
      cls: risk === "medium" ? "med" : risk === "low" ? "low" : "",
      risk,
    })),
  };
}

function snapshotConnectors(snapshot) {
  const connectors = snapshot?.data?.connectors?.connectors;
  if (!connectors) return CONNECTORS;
  return connectors.map((connector) => ({
    id: connectorLabel(connector.id),
    kind: modeLabel(connector.mode || connector.type),
    state: connector.healthy ? "ok" : "disabled",
    type: connector.type,
    configured: connector.configured,
    missingConfig: connector.missingConfig || [],
    capabilities: connector.capabilities || [],
  }));
}

function snapshotCapabilities(snapshot) {
  return snapshot?.data?.integrations?.capabilities || CAPS;
}

function snapshotLlm(snapshot) {
  const providers = snapshot?.data?.llm?.providers;
  if (!providers) return LLM;
  return providers.map((provider) => ({
    n: provider.name,
    d: `${(provider.models || []).length} modelos ${provider.mode === "live-disabled" ? "configurados" : "locais"}`,
    state: provider.mode === "live-disabled" ? "off" : "mock",
  }));
}

function snapshotActions(snapshot) {
  const actions = snapshot?.data?.actions?.actions;
  if (!actions) return ACTIONS;
  const labels = {
    "adapter.check": "Verificar conector",
    "adapter.dryRun": "Simular ação",
    "adapter.execute": "Executar conector",
  };
  return actions.map((action) => ({
    id: action.id,
    t: labels[action.id] || action.label,
    d: action.dryRun ? "simulação registrada" : action.requiresConfirmation ? "requer confirmação" : "sem mudança de estado",
    icon: action.disabledInPanel ? "terminal" : action.dryRun ? "wand" : "shield",
    state: action.disabledInPanel ? "somente terminal" : "disponível",
    enabled: !action.disabledInPanel,
    toast: `${labels[action.id] || action.label} consultado pela API local.`,
  }));
}

function snapshotEvents(snapshot) {
  const audit = snapshot?.data?.overview?.audit?.recent || [];
  if (audit.length === 0) return RECENT_EVENTS;
  return audit.slice(0, 8).map((event) => ({
    t: event.safeSummary || event.type,
    k: event.status || "audit",
    s: event.timestamp ? new Date(event.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "local",
  }));
}

function snapshotReadiness(snapshot) {
  const status = snapshot?.data?.status || snapshot?.data?.overview?.status;
  if (!status) return READINESS;
  return [
    { n: "Validação pública", v: status.health?.validation || "ok", state: status.health?.validation === "ok" ? "ok" : "blocked", d: "contrato e pacote local" },
    { n: "Estado local", v: status.health?.localState || "ok", state: status.health?.localState === "ok" ? "ok" : "blocked", d: "migrações e storage" },
    { n: "Habilidades", v: String(status.health?.skills || 0), state: "ok", d: "catálogo carregado" },
    { n: "Execuções", v: String(status.health?.runs || 0), state: "mock", d: "histórico local" },
    { n: "Modo", v: modeLabel(status.mode) || "uso local", state: "ok", d: "API local" },
  ];
}

Object.assign(window, {
  Icon, NAV, SKILLS, CONNECTORS, CAPS, LLM, ADAPTERS, ACTIONS,
  READINESS, SYNC_STATUS, SECURITY_SIGNALS, RECENT_EVENTS,
  loadApiSnapshot, snapshotSkills, snapshotConnectors, snapshotCapabilities,
  snapshotLlm, snapshotActions, snapshotEvents, snapshotReadiness,
});
