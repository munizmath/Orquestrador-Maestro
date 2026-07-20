/* ============================================================
   SEGURANÇA + CTA + FOOTER
   ============================================================ */

/* ---------- Segurança / privacidade ---------- */
function Security() {
  return (
    <section className="section section--tight" id="seguranca">
      <div className="wrap">
        <div className="reveal" style={{ maxWidth: 720 }}>
          <span className="eyebrow"><Icon name="lock" style={{ fontSize: 14 }} /> segurança & privacidade</span>
          <h2 className="h-sec" style={{ marginTop: 16 }}>Público é só o que pode ser público.</h2>
          <p className="lead" style={{ marginTop: 16 }}>
            O kit distribuído é um <b style={{ color: "var(--text)" }}>snapshot sanitizado</b>. Tudo que é sensível
            permanece local na sua máquina e nunca é publicado.
          </p>
        </div>

        <div className="sec-grid reveal">
          <div className="sec-col">
            <h4 className="mono" style={{ color: "var(--danger)" }}><Icon name="x" style={{ fontSize: 15 }} /> nunca entra no snapshot</h4>
            <div className="sec-list">
              {SEC_BAD.map((s, i) => (
                <div className="sec-row bad" key={i}>
                  <Icon name="x" style={{ fontSize: 16 }} className="ic" />
                  <span className="strike">{s}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="sec-col">
            <h4 className="mono" style={{ color: "var(--good)" }}><Icon name="check" style={{ fontSize: 15 }} /> distribuído publicamente</h4>
            <div className="sec-list">
              {SEC_GOOD.map((s, i) => (
                <div className="sec-row good" key={i}>
                  <Icon name="check" style={{ fontSize: 16 }} className="ic" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- CTA final ---------- */
function CTA() {
  return (
    <section className="section">
      <div className="wrap">
        <div className="cta reveal">
          <span className="eyebrow eyebrow--plain" style={{ justifyContent: "center" }}>comece agora</span>
          <h2 className="serif" style={{ marginTop: 14 }}>Padronize como suas IAs trabalham.</h2>
          <p className="lead">
            Instale o Orquestrador Maestro, defina seu contrato e deixe cada agente seguir as mesmas regras.
            Código aberto, sanitizado e pronto pra rodar.
          </p>
          <div className="cta-actions">
            <a className="btn btn--primary" href="#instalar"><Icon name="npm" /> Instalar via npm</a>
            <a className="btn btn--ghost" href={LINKS.github} target="_blank" rel="noopener"><Icon name="github" /> Ver no GitHub</a>
            <a className="btn btn--ghost" href={LINKS.community} target="_blank" rel="noopener"><Icon name="users" /> Comunidade Grupo IAPro</a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-inner">
          <div style={{ maxWidth: 300 }}>
            <a className="brand" href="#top">
              <span className="brand-mark"><Icon name="baton" style={{ color: "var(--accent)", fontSize: 16 }} /></span>
              Orquestrador&nbsp;Maestro
            </a>
            <p style={{ fontSize: 13.5, color: "var(--text-2)", marginTop: 14, lineHeight: 1.6 }}>
              Camada de governança e orquestração para agentes de IA. Kit público e sanitizado.
            </p>
          </div>
          <div className="footer-cols">
            <div className="footer-col">
              <h5 className="mono">produto</h5>
              <a href="#fluxo">Fluxo</a>
              <a href="#recursos">Recursos</a>
              <a href="#ferramentas">Ferramentas</a>
              <a href="#seguranca">Segurança</a>
            </div>
            <div className="footer-col">
              <h5 className="mono">começar</h5>
              <a href="#instalar">Instalação</a>
              <a href="#60s">60 segundos</a>
              <a href={LINKS.npm} target="_blank" rel="noopener">npm</a>
              <a href={LINKS.github} target="_blank" rel="noopener">GitHub</a>
            </div>
            <div className="footer-col">
              <h5 className="mono">comunidade</h5>
              <a href={LINKS.community} target="_blank" rel="noopener">Grupo IAPro</a>
              <a href={LINKS.github + "/discussions"} target="_blank" rel="noopener">Discussões</a>
              <a href={LINKS.github + "/issues"} target="_blank" rel="noopener">Issues</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom mono">
          <span>© 2026 Orquestrador Maestro · projeto público</span>
          <span>@iapro/orquestrador-maestro-cli</span>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { Security, CTA, Footer });
