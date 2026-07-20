/* ============================================================
   PAINEL — componentes compartilhados
   ============================================================ */
const { useState, useEffect, useRef, useCallback } = React;

/* ---------- Sidebar ---------- */
function Sidebar({ view, setView, open, onClose }) {
  return (
    <>
      {open && <div className="scrim" onClick={onClose}></div>}
      <aside className={"side" + (open ? " open" : "")}>
        <div className="side-brand">
          <span className="brand-mark"><Icon name="baton" style={{ color: "var(--accent)", fontSize: 17 }} /></span>
          <span className="bt">Orquestrador<small>painel do maestro</small></span>
        </div>

        <div className="env-chip">
          <Icon name="lock" style={{ fontSize: 13, color: "var(--text-3)" }} />
          uso local
          <span className="dot dot--good"></span>
        </div>

        <div className="nav-group">
          <div className="gl">acompanhamento</div>
          {NAV.map(n => (
            <button key={n.id} className={"side-item" + (view === n.id ? " active" : "")} onClick={() => { setView(n.id); onClose && onClose(); }}>
              <Icon name={n.icon} cls="si-ico" />
              {n.label}
              {n.count && <span className="si-count">{n.count}</span>}
            </button>
          ))}
        </div>

        <div className="side-foot">
          <div>v1.0 · sanitizado</div>
          <a href="Orquestrador Maestro.html">← página inicial</a>
        </div>
      </aside>
    </>
  );
}

/* ---------- Topbar ---------- */
function Topbar({ title, crumb, onRefresh, refreshing, updatedAgo, onMenu, snapshot }) {
  return (
    <div className="topbar">
      <button className="side-toggle" onClick={onMenu} aria-label="Menu"><Icon name="menu" style={{ fontSize: 18 }} /></button>
      <div>
        <div className="crumb mono">orquestrador / {crumb}</div>
        <h1>{title}</h1>
      </div>
      <div className="topbar-spacer"></div>
      <span className={"api-source mono " + (snapshot?.ok ? "ok" : "off")}>
        <span className={"dot " + (snapshot?.ok ? "dot--good" : "dot--off")}></span>
        {snapshot?.loading ? "conectando" : snapshot?.ok ? "API local ativa" : "protótipo"}
      </span>
      <span className="updated"><Icon name="clock" style={{ fontSize: 13 }} /> atualizado há {updatedAgo}</span>
      <button className={"btn btn--ghost refresh-btn" + (refreshing ? " spin" : "")} onClick={onRefresh} disabled={refreshing}>
        <Icon name="refresh" style={{ fontSize: 15 }} /> {refreshing ? "atualizando…" : "Atualizar"}
      </button>
    </div>
  );
}

/* ---------- KPI tile ---------- */
function Kpi({ icon, label, value, suffix, sub, subClass, accent }) {
  return (
    <div className={"panel kpi" + (accent ? " accent" : "")}>
      <span className="kl"><Icon name={icon} /> {label}</span>
      <span className="kv">{value}{suffix && <small>{suffix}</small>}</span>
      {sub && <span className={"ks " + (subClass || "")}>{sub}</span>}
    </div>
  );
}

/* ---------- Panel wrapper ---------- */
function DPanel({ icon, title, meta, children, body = true, className = "", flush = false }) {
  return (
    <div className={"panel dpanel " + className}>
      <div className="dpanel-h">
        {icon && <span className="ph-ico"><Icon name={icon} /></span>}
        <h3>{title}</h3>
        {meta && <span className="ph-meta mono">{meta}</span>}
      </div>
      {body ? <div className={"dpanel-b" + (flush ? " flush" : "")}>{children}</div> : children}
    </div>
  );
}

/* ---------- State pill ---------- */
function StatePill({ kind, children }) {
  const map = { ok: "ok", disabled: "off", off: "off", blocked: "blocked", mock: "mock" };
  const labels = {
    ok: "pronto",
    disabled: "desativado",
    off: "desativado",
    blocked: "bloqueado",
    mock: "teste local",
    "local-only": "uso local",
  };
  const text = typeof children === "string" ? (labels[children] || children) : children;
  return <span className={"statepill " + (map[kind] || "")}>
    {kind === "ok" && <span className="dot dot--good"></span>}
    {kind === "blocked" && <span className="dot dot--warn"></span>}
    {kind === "mock" && <span className="dot dot--accent"></span>}
    {(kind === "off" || kind === "disabled") && <span className="dot dot--off"></span>}
    {text}
  </span>;
}

/* ---------- Empty state ---------- */
function Empty({ icon = "list", title, sub }) {
  return (
    <div className="empty">
      <span className="e-ico"><Icon name={icon} style={{ fontSize: 18 }} /></span>
      <span className="e-t">{title}</span>
      {sub && <span className="e-s mono">{sub}</span>}
    </div>
  );
}

/* ---------- Readiness donut ---------- */
function Donut({ ready, blocked }) {
  const total = ready + blocked || 1;
  const r = 40, c = 2 * Math.PI * r;
  const readyLen = (ready / total) * c;
  return (
    <div className="donut">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--warn)" strokeWidth="9" opacity="0.55" />
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--good)" strokeWidth="9"
          strokeDasharray={`${readyLen} ${c}`} strokeLinecap="round" />
      </svg>
      <div className="dlabel">
        <div><b>{ready}/{total}</b><span>prontos</span></div>
      </div>
    </div>
  );
}

function StatusRows({ rows }) {
  return (
    <div className="status-rows">
      {rows.map((r) => (
        <div className="status-row" key={r.n}>
          <span>
            <b>{r.n}</b>
            {r.d && <small>{r.d}</small>}
          </span>
          <StatePill kind={r.state || r.v}>{r.v}</StatePill>
        </div>
      ))}
    </div>
  );
}

function EventList({ items }) {
  return (
    <div className="event-list">
      {items.map((e, i) => (
        <div className="event" key={i}>
          <span className={"event-dot " + e.k}></span>
          <span className="event-copy">
            <b>{e.t}</b>
            <small className="mono">{e.k}</small>
          </span>
          <span className="event-time mono">{e.s}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, Kpi, DPanel, StatePill, Empty, Donut, StatusRows, EventList });
