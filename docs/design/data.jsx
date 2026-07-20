/* ============================================================
   DADOS + ÍCONES compartilhados
   ============================================================ */

/* --- Ícones de linha simples (geométricos) --- */
function Icon({ name, style }) {
  const p = { width: "1em", height: "1em", viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", style };
  const I = {
    baton:    <g><path d="M5 19L19 5"/><circle cx="6.5" cy="17.5" r="2.2"/></g>,
    layers:   <g><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></g>,
    folder:   <g><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></g>,
    route:    <g><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M8 16c4 0 4-9 8-9"/></g>,
    play:     <g><path d="M6 4l14 8-14 8V4z"/></g>,
    shield:   <g><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></g>,
    check:    <g><path d="M20 6L9 17l-5-5"/></g>,
    x:        <g><path d="M6 6l12 12M18 6L6 18"/></g>,
    report:   <g><path d="M4 4h16v12H4z"/><path d="M4 20h16"/><path d="M8 9h8M8 12h5"/></g>,
    book:     <g><path d="M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2V5z"/><path d="M18 19H6"/></g>,
    bolt:     <g><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></g>,
    hook:     <g><path d="M12 3v8a4 4 0 11-4-4"/><circle cx="12" cy="3" r="0"/></g>,
    box:      <g><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></g>,
    cpu:      <g><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></g>,
    lock:     <g><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></g>,
    globe:    <g><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></g>,
    npm:      <g><rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M7 17V9h4v8M11 9h3v8M14 9h3v6"/></g>,
    github:   <g><path d="M9 19c-4 1.5-4-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 00-6 0C7.2 3.3 6.1 3.6 6.1 3.6a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004.7 10c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></g>,
    arrow:    <g><path d="M5 12h14M13 6l6 6-6 6"/></g>,
    chev:     <g><path d="M9 6l6 6-6 6"/></g>,
    users:    <g><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.5a3 3 0 010 5.8M21 20c0-2.6-1.5-4.8-3.6-5.7"/></g>,
    spark:    <g><path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/></g>,
    terminal: <g><path d="M4 5h16v14H4z"/><path d="M8 10l3 2-3 2M13 14h4"/></g>,
  };
  return <svg {...p}>{I[name] || null}</svg>;
}

/* --- Pipeline: Maestro → … → Reporte --- */
const PIPELINE = [
  { id: "maestro", n: "01", icon: "baton", label: "Maestro", role: "entrada · humano",
    detail: <>Você define <b>objetivo, limites, prioridades e autorizações</b>. É o regente — quem aprova o que pode e o que não pode acontecer.</> },
  { id: "global", n: "02", icon: "layers", label: "Regras globais", role: "orquestrador/rules",
    detail: <>O <b>contrato operacional</b> comum a todos os projetos: como a IA pensa, documenta, verifica e se comporta por padrão.</> },
  { id: "project", n: "03", icon: "folder", label: "Regras do projeto", role: "./.orquestrador",
    detail: <>Regras locais <b>sobrepõem</b> as globais para o repositório atual — convenções, restrições e contexto específicos.</> },
  { id: "router", n: "04", icon: "route", label: "Roteador de skills", role: "skills sob demanda",
    detail: <>Seleciona a <b>skill certa</b> para a tarefa em vez de improvisar — reduzindo gasto de contexto e mantendo previsibilidade.</> },
  { id: "exec", n: "05", icon: "play", label: "Execução", role: "codex · claude · cursor",
    detail: <>A ferramenta de IA escolhida <b>executa</b> a tarefa seguindo o mesmo contrato, independentemente de qual agente está no comando.</> },
  { id: "verify", n: "06", icon: "check", label: "Verificação", role: "hooks",
    detail: <>Hooks validam <b>segurança, documentação e resultado</b> antes de seguir — nada passa sem checagem.</> },
  { id: "worklog", n: "07", icon: "report", label: "DEV/WORKLOG", role: "memória local",
    detail: <>A <b>memória operacional local</b> registra o que foi feito. Fica na sua máquina — nunca entra no snapshot público.</> },
  { id: "report", n: "08", icon: "baton", label: "Reporte", role: "saída · verificada",
    detail: <>O resultado verificado <b>volta ao Maestro</b>. Você revisa, ajusta o contrato e o ciclo recomeça com mais precisão.</> },
];

/* --- Ferramentas compatíveis --- */
const TOOLS = [
  { id: "codex", glyph: "Cx", name: "Codex", kind: "CLI / agente", entries: ["AGENTS.md", "orquestrador/entrypoints/codex"],
    desc: "Agente de código em linha de comando.", note: "Lê o contrato global e injeta o roteador de skills no início de cada sessão." },
  { id: "claude", glyph: "CC", name: "Claude Code", kind: "CLI / agente", entries: ["CLAUDE.md", "orquestrador/entrypoints/claude"],
    desc: "Agente da Anthropic no terminal.", note: "Recebe regras globais + projeto via CLAUDE.md gerado pelo kit, com hooks de verificação." },
  { id: "opencode", glyph: "Oc", name: "OpenCode", kind: "CLI open-source", entries: ["AGENTS.md", "opencode.json"],
    desc: "Agente de código aberto.", note: "Aponta para os mesmos perfis e skills, sem duplicar configuração." },
  { id: "cursor", glyph: "Cu", name: "Cursor", kind: "IDE / editor", entries: [".cursor/rules", "AGENTS.md"],
    desc: "Editor com IA integrada.", note: "Regras do projeto viram rules do Cursor automaticamente no install." },
  { id: "gemini", glyph: "Gm", name: "Gemini CLI", kind: "CLI", entries: ["GEMINI.md", "orquestrador/entrypoints/gemini"],
    desc: "CLI do Google Gemini.", note: "Mesmo contrato operacional, adaptado ao formato de instruções do Gemini." },
  { id: "windsurf", glyph: "Ws", name: "Windsurf", kind: "IDE / editor", entries: [".windsurf/rules", "AGENTS.md"],
    desc: "Editor agentic.", note: "Perfis e skills expostos como regras nativas do Windsurf." },
  { id: "antigravity", glyph: "Ag", name: "Antigravity", kind: "IDE / agente", entries: [".agent/rules", "AGENTS.md"],
    desc: "Ambiente agentic.", note: "Recebe o mesmo entrypoint padronizado dos demais agentes." },
];

/* --- O que o sistema faz --- */
const FEATURES = [
  { icon: "box", t: "Estrutura portátil", d: "Instala uma camada organizada no home do usuário — regras, skills, hooks, perfis e entrypoints num só lugar." },
  { icon: "cpu", t: "Entrypoints multi-ferramenta", d: "Configura Codex, Claude Code, OpenCode, Cursor, Gemini, Windsurf e Antigravity para o mesmo contrato." },
  { icon: "layers", t: "Hierarquia de regras", d: "Regras globais, regras do projeto e skills compõem uma hierarquia clara e previsível de comportamento." },
  { icon: "bolt", t: "Economia de contexto", d: "O roteador carrega só a skill necessária — menos tokens gastos, respostas mais rápidas e baratas." },
  { icon: "hook", t: "Hooks de validação", d: "Pontos de verificação para segurança, documentação e qualidade antes de qualquer entrega." },
  { icon: "book", t: "Memória operacional", d: "Registro local em DEV/ do que foi feito — histórico de trabalho que nunca sai da sua máquina." },
  { icon: "shield", t: "Snapshot sanitizado", d: "Publica apenas uma versão pública limpa: sem tokens, logs, caches, memórias locais nem caminhos privados." },
  { icon: "globe", t: "Multiplataforma", d: "Funciona em Windows, Linux e macOS com a mesma estrutura e os mesmos comandos." },
  { icon: "npm", t: "Instalação via npm", d: "Um pacote, três comandos: install global, install do kit e verify. Sem ritual de configuração." },
];

/* --- 60 segundos --- */
const SIXTY = [
  { num: "0–15s", t: "Instala o kit", d: "npm global + orquestrador install monta a estrutura portátil no seu home.", tick: "$ orquestrador install" },
  { num: "15–30s", t: "Configura entrypoints", d: "Cada ferramenta de IA recebe o arquivo de entrada que aponta para o contrato.", tick: "AGENTS.md · CLAUDE.md · GEMINI.md" },
  { num: "30–45s", t: "A IA lê o contrato", d: "Regras globais + projeto + roteador de skills entram em contexto automaticamente.", tick: "rules → skills → exec" },
  { num: "45–60s", t: "Você comanda", d: "Vira o Maestro: define o objetivo, a IA orquestra, verifica e reporta de volta.", tick: "verify → DEV/ → report" },
];

/* --- O que NUNCA vai pro snapshot público --- */
const SEC_BAD = ["tokens & segredos", "logs privados", "caches", "memória local (DEV/)", "caminhos de usuário", "nomes de máquina"];
const SEC_GOOD = ["regras globais", "skills catalogadas", "hooks", "perfis", "entrypoints", "documentação"];
const LINKS = {
  github: "https://github.com/FernandoBolzan/Orquestrador-Maestro",
  npm: "https://www.npmjs.com/package/@iapro/orquestrador-maestro-cli",
  community: "https://ia.pro.br/"
};

Object.assign(window, { Icon, PIPELINE, TOOLS, FEATURES, SIXTY, SEC_BAD, SEC_GOOD, LINKS });
