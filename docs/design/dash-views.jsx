/* ============================================================
   PAINEL — views
   ============================================================ */

/* ---------- Ações (reutilizado) ---------- */
function ActionsPanel({ pushToast, snapshot }) {
  const [busy, setBusy] = useState(null);
  const actions = snapshotActions(snapshot);
  const run = (a) => {
    if (!a.enabled) return;
    setBusy(a.id);
    setTimeout(() => { setBusy(null); pushToast(a.toast); }, 850);
  };
  return (
    <DPanel icon="bolt" title="Ações" meta="local">
      <div className="actions-list">
        {actions.map(a => (
          <button key={a.id} className="action" disabled={!a.enabled || busy === a.id} onClick={() => run(a)}>
            <span className="a-ico"><Icon name={a.icon} style={{ fontSize: 16 }} /></span>
            <span>
              <span className="a-t" style={{ display: "block" }}>{a.t}</span>
              <span className="a-d">{busy === a.id ? "executando..." : a.d}</span>
            </span>
            <span className="a-state">
              <StatePill kind={a.enabled ? "ok" : "off"}>{a.state}</StatePill>
            </span>
          </button>
        ))}
      </div>
    </DPanel>
  );
}

/* ---------- Skills bars ---------- */
function SkillsBars({ skills = SKILLS }) {
  return (
    <div className="skbars">
      {skills.levels.map(l => (
        <div className="skbar" key={l.k}>
          <div className="skl">
            <span className="mono">{l.k}</span>
            <span className="c">{l.c} habilidades</span>
          </div>
          <div className="track"><div className={"fill " + l.cls} style={{ width: (skills.total ? l.c / skills.total * 100 : 0) + "%" }}></div></div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   VISÃO GERAL
   ============================================================ */
function OverviewView({ pushToast, snapshot }) {
  window.__omxSnapshot = snapshot;
  const skills = snapshotSkills(snapshot);
  const connectors = snapshotConnectors(snapshot);
  const caps = snapshotCapabilities(snapshot);
  const llm = snapshotLlm(snapshot);
  const events = snapshotEvents(snapshot);
  const readinessRows = snapshotReadiness(snapshot);
  const overview = snapshot?.data?.overview;
  const ready = overview?.readiness?.ready ?? 0;
  const blocked = overview?.readiness?.blocked ?? 4;
  const runsTotal = overview?.runs?.count ?? overview?.metrics?.runs?.total ?? 0;
  const queue = overview?.queue || { total: 0, pending: 0, running: 0, tasks: [] };
  const audit = overview?.audit || { total: 0, recent: [] };
  const mockOk = connectors.filter(c => c.state === "ok").length;
  return (
    <>
      <div className="ops-hero">
        <div>
          <span className="eyebrow">painel local do maestro</span>
          <h2>{snapshot?.ok ? "Operação conectada à API local." : "Operação governada, antes da primeira execução."}</h2>
          <p>
            Este painel acompanha prontidão, conectores, habilidades, sinais de segurança e ações de verificação.
            Envios reais ficam bloqueados por padrão; operações externas exigem autorização explícita pelo terminal.
          </p>
        </div>
        <div className="ops-command mono">
          <span>$ orquestrador-maestro verify</span>
          <span className="ok">✓ {snapshot?.ok ? `API: ${snapshot.base}` : "contrato operacional pronto"}</span>
          <span className="warn">! {blocked} envios reais bloqueados</span>
        </div>
      </div>

      <div className="kpis">
        <Kpi icon="shield" label="Ambiente" value="Pronto" sub="aguardando 1ª execução" subClass="good" accent />
        <Kpi icon="skills" label="Habilidades" value={skills.total} sub="catalogadas" />
        <Kpi icon="activity" label="Execuções" value={runsTotal} sub={runsTotal ? "histórico local" : "nenhuma execução ainda"} />
        <Kpi icon="queue" label="Fila" value={queue.total} sub={`${queue.pending} pendentes · ${queue.running} rodando`} />
        <Kpi icon="plug" label="Conectores" value={mockOk} suffix={"/" + connectors.length} sub="prontos" />
      </div>

      <div className="pgrid">
        {/* Readiness */}
        <div className="col-4">
          <DPanel icon="shield" title="Envios reais" meta="0/4">
            <div className="ready-wrap">
              <Donut ready={ready} blocked={blocked} />
              <div className="ready-legend">
                <span className="lg"><span className="dot dot--good"></span> prontos <b>{ready}</b></span>
                <span className="lg"><span className="dot dot--warn"></span> bloqueados <b>{blocked}</b></span>
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 14, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.55 }}>
              Bloqueados por segurança. Habilite somente pelo terminal, depois de revisar a configuração.
            </p>
          </DPanel>
        </div>

        <div className="col-4">
          <DPanel icon="check" title="Contrato operacional" meta="5/5">
            <StatusRows rows={readinessRows} />
          </DPanel>
        </div>

        {/* Skills */}
        <div className="col-4">
          <DPanel icon="skills" title="Habilidades catalogadas" meta={skills.total + " total"}>
            <SkillsBars skills={skills} />
          </DPanel>
        </div>

        {/* Ações */}
        <div className="col-4">
          <ActionsPanel pushToast={pushToast} snapshot={snapshot} />
        </div>

        {/* Conectores */}
        <div className="col-5">
          <DPanel icon="plug" title="Conectores" meta={mockOk + "/" + CONNECTORS.length + " prontos"} flush>
            <div className="rowlist">
              {connectors.map(c => (
                <div className="rowitem" key={c.id}>
                  <span className="rn">{c.id}</span>
                  <span className="rstate">
                    <StatePill kind={c.state === "ok" ? "ok" : "disabled"}>{c.state === "ok" ? "pronto" : "bloqueado"}</StatePill>
                  </span>
                </div>
              ))}
            </div>
          </DPanel>
        </div>

        {/* Integrações */}
        <div className="col-4">
          <DPanel icon="flow" title="Integrações" meta="6 opções">
            <div className="caps">
              {caps.map(c => (
                <div className="cap" key={c.n}>
                  <span className="cn">{c.n}</span>
                  <span className="cmode"><StatePill kind="mock">{c.mode}</StatePill></span>
                </div>
              ))}
            </div>
          </DPanel>
        </div>

        <div className="col-4">
          <DPanel icon="refresh" title="Sincronização" meta="cópia local">
            <StatusRows rows={SYNC_STATUS} />
          </DPanel>
        </div>

        <div className="col-4">
          <DPanel icon="lock" title="Sinais de segurança" meta="sanitização">
            <StatusRows rows={SECURITY_SIGNALS} />
          </DPanel>
        </div>

        {/* LLM */}
        <div className="col-4">
          <DPanel icon="cpu" title="IA de texto" flush>
            <div className="rowlist">
              {llm.map(l => (
                <div className="rowitem" key={l.n} style={{ display: "block" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="rn">{l.n}</span>
                    <span className="rstate"><StatePill kind={l.state}>{l.state === "mock" ? "teste local" : "desativado"}</StatePill></span>
                  </div>
                  <span className="rd mono" style={{ display: "block", marginTop: 4 }}>{l.d}</span>
                </div>
              ))}
            </div>
          </DPanel>
        </div>

        <div className="col-8">
          <DPanel icon="activity" title="Eventos recentes" meta="local">
            <EventList items={events} />
          </DPanel>
        </div>

        {/* Fila */}
        <div className="col-4">
          <DPanel icon="queue" title="Fila" meta="0 locais">
            <Empty icon="queue" title={queue.total ? `${queue.total} tarefa(s)` : "Fila vazia"} sub={`${queue.pending} pendentes · ${queue.running} rodando`} />
          </DPanel>
        </div>

        {/* Audit */}
        <div className="col-7">
          <DPanel icon="list" title="Registro de segurança">
            <Empty icon="list" title={audit.total ? `${audit.total} registro(s)` : "Nenhum registro ainda"} sub="ações auditadas aparecerão aqui" />
          </DPanel>
        </div>

        {/* Alertas */}
        <div className="col-5">
          <DPanel icon="alert" title="Alertas">
            <Empty icon="check" title="Nenhum alerta" sub="tudo dentro do contrato" />
          </DPanel>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   HABILIDADES
   ============================================================ */
function SkillsView({ snapshot }) {
  const skills = snapshotSkills(snapshot);
  const desc = {
    "alta": "Habilidades de maior impacto. Exigem verificação reforçada antes de executar.",
    "média": "O grosso do catálogo: tarefas operacionais do dia a dia.",
    "baixa": "Habilidades auxiliares e utilitárias, de baixo risco.",
  };
  return (
    <>
      <div className="view-head">
        <h2>Habilidades catalogadas</h2>
        <p>O roteador seleciona a habilidade certa para cada tarefa, em vez de improvisar. Isso economiza contexto e deixa o trabalho mais previsível. Há {skills.total} habilidades disponíveis nesta instalação.</p>
      </div>
      <div className="pgrid">
        <div className="col-5">
          <DPanel icon="skills" title="Distribuição por nível" meta={skills.total + " total"}>
            <SkillsBars skills={skills} />
          </DPanel>
        </div>
        {skills.levels.map(l => (
          <div className="col-7" key={l.k} style={{ gridColumn: "span 7" }}>
            <div className="panel" style={{ padding: 18, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 34, color: "var(--text)", minWidth: 54 }}>{l.c}</div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span className="mono" style={{ fontSize: 13, color: "var(--text)" }}>nível {l.k}</span>
                  <StatePill kind={l.cls === "" ? "mock" : "off"}>{skills.total ? Math.round(l.c / skills.total * 100) : 0}%</StatePill>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 5 }}>{desc[l.k]}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ============================================================
   CONECTORES
   ============================================================ */
function ConnectorsView({ snapshot }) {
  const connectors = snapshotConnectors(snapshot);
  const mock = connectors.filter(c => c.kind === "mock" || c.kind === "teste local" || c.kind === "local-dry-run");
  const live = connectors.filter(c => c.kind !== "mock" && c.kind !== "teste local" && c.kind !== "local-dry-run");
  const Group = ({ title, items, note }) => (
    <DPanel icon="plug" title={title} meta={items.length + " itens"} flush>
      <div className="rowlist">
        {items.map(c => (
          <div className="rowitem" key={c.id}>
            <span className="rn">{c.id}</span>
            <span className="rd mono" style={{ marginLeft: 4 }}>{c.kind}</span>
            <span className="rstate"><StatePill kind={c.state === "ok" ? "ok" : "disabled"}>{c.state === "ok" ? "pronto" : "bloqueado"}</StatePill></span>
          </div>
        ))}
      </div>
      {note && <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "var(--text-3)" }}>{note}</div>}
    </DPanel>
  );
  return (
    <>
      <div className="view-head">
        <h2>Conectores</h2>
        <p>Conectores de teste rodam localmente para simulações seguras. Conectores de envio real ficam desabilitados por padrão e só são habilitados explicitamente pelo terminal.</p>
      </div>
      <div className="pgrid">
        <div className="col-6"><Group title="Teste local" items={mock} note="Disponíveis para testar sem efeitos externos." /></div>
        <div className="col-6"><Group title="Envio real" items={live} note="Bloqueados por segurança. Habilite somente pelo terminal." /></div>
      </div>
    </>
  );
}

/* ============================================================
   EXECUÇÕES
   ============================================================ */
function RunsView({ snapshot }) {
  const overview = snapshot?.data?.overview;
  const runs = overview?.runs?.recent || snapshot?.data?.runs?.recent || [];
  const queue = overview?.queue || { total: 0, pending: 0, running: 0 };
  const metrics = snapshot?.data?.metrics || overview?.metrics || { runs: { total: runs.length }, audit: { total: 0 } };
  return (
    <>
      <div className="view-head">
        <h2>Execuções</h2>
        <p>Histórico de execuções, fila de tarefas e métricas de atividade. Esta instalação ainda não executou nenhuma tarefa.</p>
      </div>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Kpi icon="activity" label="Execuções" value={metrics.runs?.total || runs.length} sub="total" />
        <Kpi icon="queue" label="Fila" value={queue.total} sub={`${queue.pending} pendentes · ${queue.running} rodando`} />
        <Kpi icon="chart" label="Eventos" value={metrics.audit?.total || 0} sub="registrados" />
        <Kpi icon="clock" label="Última execução" value={runs[0]?.startedAt ? "recente" : "-"} sub={runs[0]?.startedAt || "nunca"} />
      </div>
      <div className="pgrid">
        <div className="col-8"><DPanel icon="activity" title="Histórico de execuções">{runs.length ? <EventList items={runs.map((run) => ({ t: run.summary || run.kind, k: run.status, s: run.startedAt || "local" }))} /> : <Empty icon="activity" title="Nenhuma execução ainda" sub="rode uma tarefa pelo terminal para começar" />}</DPanel></div>
        <div className="col-4"><DPanel icon="queue" title="Fila local"><Empty icon="queue" title={queue.total ? `${queue.total} tarefa(s)` : "Fila vazia"} sub={`${queue.pending} pendentes · ${queue.running} rodando`} /></DPanel></div>
      </div>
    </>
  );
}

/* ============================================================
   AUDITORIA
   ============================================================ */
function AuditView({ snapshot }) {
  const audit = snapshot?.data?.overview?.audit || { total: 0, recent: [] };
  const alerts = snapshot?.data?.alerts?.alerts || [];
  return (
    <>
      <div className="view-head">
        <h2>Auditoria</h2>
        <p>Registro auditável de ações e alertas. A memória operacional completa fica local em <span className="mono" style={{ color: "var(--accent)" }}>DEV/</span> e nunca entra na cópia pública.</p>
      </div>
      <div className="pgrid">
        <div className="col-7"><DPanel icon="list" title="Registro de segurança">{audit.recent?.length ? <EventList items={snapshotEvents(snapshot)} /> : <Empty icon="list" title={audit.total ? `${audit.total} registro(s)` : "Nenhum registro ainda"} sub="ações auditadas aparecerão aqui" />}</DPanel></div>
        <div className="col-5"><DPanel icon="alert" title="Alertas">{alerts.length ? <EventList items={alerts.map((alert) => ({ t: alert.title, k: alert.severity, s: alert.category }))} /> : <Empty icon="check" title="Nenhum alerta" sub="tudo dentro do contrato" />}</DPanel></div>
        <div className="col-12">
          <DPanel icon="lock" title="Privacidade da auditoria">
            <p style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.6 }}>
              Tokens, logs privados, caches, memória local (<span className="mono">DEV/</span>), caminhos de usuário e nomes de máquina
              <b style={{ color: "var(--text)" }}> nunca</b> são publicados. A cópia distribuída contém apenas regras, habilidades, verificações, perfis e pontos de entrada.
            </p>
          </DPanel>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { OverviewView, SkillsView, ConnectorsView, RunsView, AuditView });
