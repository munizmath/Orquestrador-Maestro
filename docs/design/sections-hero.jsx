/* ============================================================
   HOOKS + NAV + HERO + PIPELINE
   ============================================================ */
const { useState, useEffect, useRef, useCallback } = React;

/* Scroll reveal */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
    const io = new IntersectionObserver((ents) => {
      ents.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  });
}

/* Copy to clipboard button */
function CopyBtn({ text, className = "copy-btn", label = "copiar" }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    const t = typeof text === "function" ? text() : text;
    navigator.clipboard?.writeText(t).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }).catch(() => {});
  };
  return (
    <button className={className + (done ? " copied" : "")} onClick={copy} aria-label="Copiar comando">
      {done ? "copiado ✓" : label}
    </button>
  );
}

/* ---------- NAV ---------- */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <nav className={"nav" + (scrolled ? " nav--scrolled" : "")}>
      <div className="wrap nav-inner">
        <a className="brand" href="#top">
          <span className="brand-mark"><Icon name="baton" style={{ color: "var(--accent)", fontSize: 16 }} /></span>
          Orquestrador&nbsp;Maestro
        </a>
        <div className="nav-links">
          <a href="#fluxo">Fluxo</a>
          <a href="#60s">60 segundos</a>
          <a href="#recursos">Recursos</a>
          <a href="#ferramentas">Ferramentas</a>
          <a href="#instalar">Instalar</a>
          <a href="#seguranca">Segurança</a>
        </div>
        <div className="nav-spacer"></div>
        <div className="nav-cta">
          <a className="btn btn--ghost" href={LINKS.github} target="_blank" rel="noopener"><Icon name="github" /> GitHub</a>
          <a className="btn btn--primary" href="#instalar"><Icon name="npm" /> Instalar</a>
        </div>
      </div>
    </nav>
  );
}

/* ---------- PIPELINE (animado + clicável) ---------- */
function Pipeline({ compact = false }) {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  useEffect(() => {
    if (!auto) return;
    timer.current = setInterval(() => setActive(a => (a + 1) % PIPELINE.length), 2200);
    return () => clearInterval(timer.current);
  }, [auto]);

  const pick = (i) => { setAuto(false); setActive(i); };

  return (
    <div className="pipe" onMouseLeave={() => !compact && setAuto(true)}>
      <div className="pipe-head">
        <span className="dots"><i></i><i></i><i></i></span>
        <span className="pipe-title">orquestrador · pipeline operacional</span>
        <span className="pipe-live"><span className="dot dot--good"></span> {auto ? "executando" : "pausado"}</span>
      </div>
      <div className="pipe-rail">
        {PIPELINE.map((s, i) => (
          <React.Fragment key={s.id}>
            <button
              className={"pipe-node" + (i === active ? " active lit" : "") + (i < active ? " lit" : "")}
              onClick={() => pick(i)}
              onMouseEnter={() => pick(i)}
            >
              <span className="idx">{s.n}</span>
              <span>
                <span className="nlabel">{s.label}</span>
                <span className="nrole mono">{s.role}</span>
              </span>
              <span className="narrow"><Icon name="chev" style={{ fontSize: 16 }} /></span>
            </button>
            {i === active && (
              <div className="pipe-detail">{s.detail}</div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ---------- HERO ---------- */
function Hero() {
  return (
    <header className="hero grid-bg" id="top">
      <div className="wrap hero-grid">
        <div>
          <span className="eyebrow">camada operacional para agentes de IA</span>
          <h1 style={{ marginTop: 18 }}>
            Orquestrador Maestro
          </h1>
          <p className="lead hero-lead">
            Uma camada de governança para suas IAs trabalharem com o mesmo contrato operacional.
            O kit instala regras, skills, hooks, perfis e entrypoints no seu computador
            para que Codex, Claude Code, OpenCode, Cursor, Gemini CLI, Windsurf e Antigravity sigam a mesma forma de operar.
            Você é o <b style={{ color: "var(--text)" }}>Maestro</b>; a IA é o <b style={{ color: "var(--text)" }}>Orquestrador</b>.
          </p>

          <div className="hero-pills">
            <span className="tag"><span className="dot dot--accent"></span> não é uma IA nova</span>
            <span className="tag"><span className="dot dot--good"></span> kit público sanitizado</span>
            <span className="tag">Windows · Linux · macOS</span>
          </div>

          <div className="hero-system" aria-label="Resumo do contrato operacional">
            <span>maestro</span>
            <i></i>
            <span>contrato</span>
            <i></i>
            <span>skills</span>
            <i></i>
            <span>verificação</span>
            <i></i>
            <span>reporte</span>
          </div>

          <div style={{ marginTop: 26 }}>
            <div className="install-chip">
              <span><span className="prompt">$</span> npm i -g @iapro/orquestrador-maestro-cli</span>
              <CopyBtn text="npm install -g @iapro/orquestrador-maestro-cli" />
            </div>
          </div>

          <div className="hero-actions">
            <a className="btn btn--primary" href="#instalar"><Icon name="terminal" /> Como instalar</a>
            <a className="btn btn--ghost" href="#fluxo"><Icon name="route" /> Ver o fluxo</a>
            <a className="btn btn--ghost" href={LINKS.github} target="_blank" rel="noopener"><Icon name="github" /> Repositório</a>
          </div>

          <div className="hero-meta">
            <span><b>skills</b> carregadas sob demanda</span>
            <span><b>7</b> ferramentas suportadas</span>
            <span><b>3</b> comandos pra começar</span>
          </div>
        </div>

        <div className="reveal">
          <Pipeline />
        </div>
      </div>
    </header>
  );
}

Object.assign(window, { useReveal, CopyBtn, Nav, Pipeline, Hero });
