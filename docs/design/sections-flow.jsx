/* ============================================================
   CONCEITO + FLUXO + 60 SEGUNDOS
   ============================================================ */

/* ---------- Conceito: Maestro vs Orquestrador ---------- */
function Concept() {
  return (
    <section className="section section--tight" id="conceito">
      <div className="wrap">
        <div className="reveal" style={{ maxWidth: 720 }}>
          <span className="eyebrow">dois papéis, um contrato</span>
          <h2 className="h-sec" style={{ marginTop: 16 }}>Você rege. A IA executa.</h2>
          <p className="lead" style={{ marginTop: 16 }}>
            O Orquestrador Maestro separa claramente quem decide de quem faz. Sem ambiguidade
            sobre autoridade — e sem IA agindo fora do que foi autorizado.
          </p>
        </div>

        <div className="duo reveal">
          <div className="panel duo-card">
            <span className="role">o humano</span>
            <h3 className="serif">Maestro</h3>
            <span className="who mono">você</span>
            <ul>
              <li><Icon name="check" /> Define objetivos, prioridades e o que é sucesso.</li>
              <li><Icon name="check" /> Estabelece limites e autorizações explícitas.</li>
              <li><Icon name="check" /> Aprova, ajusta o contrato e revisa o resultado.</li>
            </ul>
          </div>

          <div className="duo-vs mono">vs</div>

          <div className="panel duo-card">
            <span className="role">a inteligência</span>
            <h3 className="serif">Orquestrador</h3>
            <span className="who mono">codex · claude · cursor · …</span>
            <ul>
              <li><Icon name="check" /> Lê as regras e escolhe a skill adequada.</li>
              <li><Icon name="check" /> Executa seguindo o contrato operacional.</li>
              <li><Icon name="check" /> Verifica, registra e reporta de volta ao Maestro.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Fluxo detalhado (clicável, reaproveita Pipeline) ---------- */
function Flow() {
  return (
    <section className="section grid-bg" id="fluxo">
      <div className="wrap">
        <div className="reveal" style={{ maxWidth: 720 }}>
          <span className="eyebrow">como funciona</span>
          <h2 className="h-sec" style={{ marginTop: 16 }}>Do comando ao reporte, em uma linha.</h2>
          <p className="lead" style={{ marginTop: 16 }}>
            Toda tarefa atravessa o mesmo caminho — independentemente da ferramenta de IA no comando.
            Passe o mouse ou toque em cada etapa para ver o que acontece.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 22, marginTop: 40 }}>
          <div className="reveal" style={{ maxWidth: 560, marginInline: "auto", width: "100%" }}>
            <Pipeline />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Como funciona em 60 segundos ---------- */
function Sixty() {
  return (
    <section className="section section--tight" id="60s">
      <div className="wrap">
        <div className="reveal" style={{ maxWidth: 720 }}>
          <span className="eyebrow">do zero ao comando</span>
          <h2 className="h-sec" style={{ marginTop: 16 }}>Como funciona em 60 segundos.</h2>
        </div>
        <div className="steps60 reveal">
          {SIXTY.map((s, i) => (
            <div className="panel step60" key={i}>
              <span className="num mono">{s.num}</span>
              <h4>{s.t}</h4>
              <p>{s.d}</p>
              <span className="tick mono">{s.tick}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Concept, Flow, Sixty });
