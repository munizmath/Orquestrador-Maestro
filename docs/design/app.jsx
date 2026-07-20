/* ============================================================
   APP + TWEAKS
   ============================================================ */
const M_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "enterprise",
  "accent": "#15976b",
  "gridTexture": true,
  "fontScale": 100
}/*EDITMODE-END*/;

const ACCENTS = [
  "#15976b", // verde-teal enterprise
  "#2f6df0", // azul corporativo
  "#7a5cf0", // violeta
  "#d98a1f"  // âmbar
];

function App() {
  const [t, setTweak] = useTweaks(M_TWEAK_DEFAULTS);
  useReveal();

  // aplica tema + acento + escala
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", t.theme);
    root.style.setProperty("--accent", t.accent);
    // brilho do acento: clareia levemente
    root.style.setProperty("--accent-bright", t.accent);
    root.style.fontSize = (17 * (t.fontScale / 100)) + "px";
    document.body.style.fontSize = (17 * (t.fontScale / 100)) + "px";
  }, [t.theme, t.accent, t.fontScale]);

  return (
    <>
      <Nav />
      <main className={t.gridTexture ? "" : "no-grid"}>
        <Hero />
        <Concept />
        <Flow />
        <Sixty />
        <Features />
        <Tools />
        <Install />
        <Security />
        <CTA />
      </main>
      <Footer />

      <TweaksPanel>
        <TweakSection label="Direção visual" />
        <TweakRadio
          label="Tema"
          value={t.theme}
          options={["enterprise", "midnight", "blueprint"]}
          onChange={(v) => setTweak("theme", v)}
        />
        <TweakColor
          label="Acento"
          value={t.accent}
          options={ACCENTS}
          onChange={(v) => setTweak("accent", v)}
        />
        <TweakToggle
          label="Textura de grid"
          value={t.gridTexture}
          onChange={(v) => setTweak("gridTexture", v)}
        />
        <TweakSection label="Tipografia" />
        <TweakSlider
          label="Escala do texto"
          value={t.fontScale}
          min={88} max={116} step={2} unit="%"
          onChange={(v) => setTweak("fontScale", v)}
        />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
