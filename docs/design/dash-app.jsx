/* ============================================================
   PAINEL — App
   ============================================================ */
const D_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "enterprise",
  "accent": "#15976b"
}/*EDITMODE-END*/;
const D_ACCENTS = ["#15976b", "#2f6df0", "#7a5cf0", "#d98a1f"];

const VIEW_META = {
  overview:  { title: "Visão geral", crumb: "visão geral", C: () => window.OverviewView },
  skills:    { title: "Habilidades", crumb: "habilidades", C: () => window.SkillsView },
  connectors:{ title: "Conectores", crumb: "conectores", C: () => window.ConnectorsView },
  runs:      { title: "Execuções", crumb: "execuções", C: () => window.RunsView },
  audit:     { title: "Auditoria", crumb: "auditoria", C: () => window.AuditView },
};

function DashApp() {
  const [t, setTweak] = useTweaks(D_TWEAK_DEFAULTS);
  const [view, setView] = useState("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [ago, setAgo] = useState(0);            // segundos desde a última atualização
  const [sideOpen, setSideOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [snapshot, setSnapshot] = useState({ ok: false, data: {}, error: null, base: null, loadedAt: null, loading: true });

  // tema + acento
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", t.theme);
    root.style.setProperty("--accent", t.accent);
    root.style.setProperty("--accent-bright", t.accent);
  }, [t.theme, t.accent]);

  // relógio "atualizado há Xs"
  useEffect(() => {
    const id = setInterval(() => setAgo(a => a + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const agoLabel = ago < 5 ? "instantes" : ago < 60 ? ago + "s" : Math.floor(ago / 60) + "min";

  const refresh = () => {
    setRefreshing(true);
    loadApiSnapshot().then((next) => {
      setSnapshot({ ...next, loading: false });
      setAgo(0);
      pushToast(next.ok ? "Painel atualizado pela API local." : "API local indisponível — exibindo protótipo visual.");
    }).finally(() => setRefreshing(false));
  };

  const pushToast = useCallback((msg) => {
    if (!msg) return;
    const id = Date.now() + Math.random();
    setToasts(ts => [...ts, { id, msg }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 2600);
  }, []);

  const meta = VIEW_META[view];
  const ViewComp = meta.C();

  useEffect(() => {
    let cancelled = false;
    loadApiSnapshot().then((next) => {
      if (!cancelled) {
        setSnapshot({ ...next, loading: false });
        setAgo(0);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="dash">
      <div className="shell">
        <Sidebar view={view} setView={setView} open={sideOpen} onClose={() => setSideOpen(false)} />
        <div className="main">
          <Topbar
            title={meta.title} crumb={meta.crumb}
            onRefresh={refresh} refreshing={refreshing} updatedAgo={agoLabel}
            onMenu={() => setSideOpen(true)}
            snapshot={snapshot}
          />
          <div className="content">
            <ViewComp pushToast={pushToast} snapshot={snapshot} />
          </div>
        </div>
      </div>

      <div className="toast-wrap">
        {toasts.map(tt => (
          <div className="toast" key={tt.id}><Icon name="check" /> {tt.msg}</div>
        ))}
      </div>

      <TweaksPanel>
        <TweakSection label="Direção visual" />
        <TweakRadio label="Tema" value={t.theme} options={["enterprise", "midnight", "blueprint"]} onChange={(v) => setTweak("theme", v)} />
        <TweakColor label="Acento" value={t.accent} options={D_ACCENTS} onChange={(v) => setTweak("accent", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<DashApp />);
