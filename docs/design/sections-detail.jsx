/* ============================================================
   RECURSOS + FERRAMENTAS + INSTALAÇÃO
   ============================================================ */

/* ---------- O que o sistema faz ---------- */
function Features() {
  return (
    <section className="section" id="recursos">
      <div className="wrap">
        <div className="reveal" style={{ maxWidth: 720 }}>
          <span className="eyebrow">o que o kit instala</span>
          <h2 className="h-sec" style={{ marginTop: 16 }}>Infraestrutura, não mais um chatbot.</h2>
          <p className="lead" style={{ marginTop: 16 }}>
            Uma camada operacional concreta no seu computador — componentes reais que organizam
            como qualquer agente de IA trabalha nos seus projetos.
          </p>
        </div>
        <div className="feat-grid reveal">
          {FEATURES.map((f, i) => (
            <div className="panel feat" key={i}>
              <span className="ico"><Icon name={f.icon} /></span>
              <h4>{f.t}</h4>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Seletor de ferramentas compatíveis ---------- */
function Tools() {
  const [sel, setSel] = useState(0);
  const t = TOOLS[sel];
  return (
    <section className="section grid-bg" id="ferramentas">
      <div className="wrap">
        <div className="reveal" style={{ maxWidth: 720 }}>
          <span className="eyebrow">ferramentas compatíveis</span>
          <h2 className="h-sec" style={{ marginTop: 16 }}>Um contrato. Sete agentes.</h2>
          <p className="lead" style={{ marginTop: 16 }}>
            Selecione uma ferramenta para ver o entrypoint que o kit configura. Todos apontam
            para a mesma hierarquia de regras e skills.
          </p>
        </div>

        <div className="tools reveal">
          <div className="tool-list">
            {TOOLS.map((tool, i) => (
              <button key={tool.id} className={"tool-item" + (i === sel ? " active" : "")} onClick={() => setSel(i)}>
                <span className="glyph">{tool.glyph}</span>
                <span>
                  <span className="tname">{tool.name}</span>
                  <span className="tkind mono" style={{ display: "block" }}>{tool.kind}</span>
                </span>
                <span className="chev"><Icon name="chev" style={{ fontSize: 16 }} /></span>
              </button>
            ))}
          </div>

          <div className="panel tool-detail">
            <div className="tool-detail-head">
              <span className="glyph-lg">{t.glyph}</span>
              <div>
                <h4>{t.name}</h4>
                <p>{t.desc}</p>
              </div>
              <span className="tag" style={{ marginLeft: "auto" }}><span className="dot dot--good"></span> suportado</span>
            </div>
            <div className="tool-detail-body">
              <div className="label mono">entrypoints configurados</div>
              <div className="entry-row">
                {t.entries.map((e, i) => <span className="tag mono" key={i}><Icon name="folder" style={{ fontSize: 13, color: "var(--accent)" }} /> {e}</span>)}
              </div>
              <div className="label mono">o que acontece</div>
              <p style={{ fontSize: 15, color: "var(--text-2)", lineHeight: 1.6 }}>{t.note}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Instalação ---------- */
function Install() {
  const lines = [
    { p: "$", cmd: "npm install -g @iapro/orquestrador-maestro-cli", com: "# instala o CLI globalmente" },
    { p: "$", cmd: "orquestrador-maestro install", com: "# monta a estrutura no seu home" },
    { out: "  ✓ regras globais  ✓ skills  ✓ hooks  ✓ entrypoints", ok: true },
    { p: "$", cmd: "orquestrador-maestro verify", com: "# valida a instalação" },
    { out: "  ✓ tudo pronto — você é o Maestro.", ok: true },
  ];
  const fullScript = "npm install -g @iapro/orquestrador-maestro-cli\norquestrador-maestro install\norquestrador-maestro verify";
  return (
    <section className="section" id="instalar">
      <div className="wrap">
        <div className="reveal" style={{ maxWidth: 720 }}>
          <span className="eyebrow">instalação</span>
          <h2 className="h-sec" style={{ marginTop: 16 }}>Três comandos. Sem ritual.</h2>
          <p className="lead" style={{ marginTop: 16 }}>
            Requer Node.js. Funciona igual em Windows, Linux e macOS.
          </p>
        </div>

        <div className="install-cols reveal">
          <div className="term">
            <div className="term-head">
              <span className="dots"><i></i><i></i><i></i></span>
              <span className="tt mono">bash — instalação</span>
              <CopyBtn text={fullScript} />
            </div>
            <div className="term-body">
              {lines.map((l, i) => (
                <span className="ln" key={i}>
                  {l.p && <span className="c-prompt">{l.p} </span>}
                  {l.cmd && <span className="c-cmd">{l.cmd}  </span>}
                  {l.com && <span className="c-com">{l.com}</span>}
                  {l.out && <span className={l.ok ? "c-ok" : "c-out"}>{l.out}</span>}
                </span>
              ))}
            </div>
          </div>

          <div className="install-notes">
            <div className="panel install-note">
              <div className="k mono">install</div>
              <p>Cria a estrutura portátil no seu home e configura os entrypoints de cada ferramenta de IA detectada.</p>
            </div>
            <div className="panel install-note">
              <div className="k mono">verify</div>
              <p>Confere se regras, skills e hooks estão no lugar — e se nenhum dado sensível vazaria para o snapshot público.</p>
            </div>
            <div className="panel install-note">
              <div className="k mono">update</div>
              <p>Reaplica a camada quando o kit evolui, preservando suas regras de projeto e a memória local em <span className="mono" style={{ color: "var(--accent)" }}>DEV/</span>.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Features, Tools, Install });
