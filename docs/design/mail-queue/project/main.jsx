// Main canvas composition
//
// Three artboards side-by-side. Each artboard has a reasoning band at the top
// (2-3 lines for canvas-scan) followed by the actual mid-fi concept.

const ReasoningBand = ({ label, headline, tradeoffs }) => (
  <div style={{
    padding: "16px 24px 14px",
    borderBottom: "1px solid var(--color-border)",
    background: "hsl(210 40% 98%)",
    display: "flex", flexDirection: "column", gap: 6,
  }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)",
        color: "var(--color-muted-foreground)", letterSpacing: "var(--tracking-wider)",
      }}>{label}</span>
      <span style={{ fontSize: "var(--text-sm)", fontWeight: 600,
        letterSpacing: "var(--tracking-tight)" }}>
        {headline}
      </span>
    </div>
    <div style={{ display: "flex", gap: 24, fontSize: "var(--text-xs)",
      color: "var(--color-muted-foreground)", lineHeight: 1.4 }}>
      {tradeoffs.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 6, flex: 1 }}>
          <span style={{ fontFamily: "var(--font-mono)",
            color: t.kind === "pro" ? "hsl(142 72% 29%)" :
                   t.kind === "con" ? "hsl(0 74% 42%)" : "var(--color-muted-foreground)",
            fontWeight: 600, whiteSpace: "nowrap" }}>
            {t.kind === "pro" ? "✓ Pro" : t.kind === "con" ? "✗ Con" : "○ ?"}
          </span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  </div>
);

const ArtboardWrap = ({ band, children }) => (
  <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
    background: "var(--color-background)", overflow: "hidden" }}>
    {band}
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {children}
    </div>
  </div>
);

const App = () => (
  <window.DesignCanvas
    title="Folio · Mail-Queue View"
    subtitle="Iteration 1 · drei Layout-Konzepte für Architekt-Entscheid · synthetisches Sample (120 Records, ~6 Disagreements)"
  >
    <window.DCSection
      id="iteration-1"
      title="Layout-Konzepte"
      subtitle="A: Kanban · B: Liste mit Filter-Chips · C: Sender-Pivot, Disagreement-First. Jedes Artboard hat Reasoning-Band oben."
      gap={56}
    >
      <window.DCArtboard
        id="concept-a"
        label="A · Kanban (safe pick · Folio-DNA)"
        width={1480}
        height={1100}
      >
        <ArtboardWrap
          band={
            <ReasoningBand
              label="KONZEPT A"
              headline="Kanban — 5 Spalten = 5 finale Aktionen"
              tradeoffs={[
                { kind: "pro", text: "1:1 zu Folio's existing KanbanBoard. Architekten-Vokabular. Re-Klassifikation per Drag-and-Drop kommt in Phase 2 ohne neuen Pattern." },
                { kind: "con", text: "'Behalten'-Spalte erschlägt visuell (69 von 120 Karten). Bei 600 Mails wird Vertikal-Scroll je Spalte hart." },
                { kind: "warn", text: "Disagreement nur als Card-Ring sichtbar — gut für Wahrnehmung, mässig für Drill-down. Toggle in Stats-Bar isoliert." },
              ]}
            />
          }
        >
          <window.ConceptA />
        </ArtboardWrap>
      </window.DCArtboard>

      <window.DCArtboard
        id="concept-b"
        label="B · Filter-Chips + Dichte Liste (variant)"
        width={1480}
        height={1100}
      >
        <ArtboardWrap
          band={
            <ReasoningBand
              label="KONZEPT B"
              headline="Filter-Chips + dichte Liste — Sortierung als Erstklasse-Bürger"
              tradeoffs={[
                { kind: "pro", text: "Skaliert auf 600+ Records ohne Layout-Bruch. Sort-by-Konfidenz/Disagreement liest Heuristik-Probleme direkt heraus." },
                { kind: "pro", text: "Sender-Rail rechts ist permanent sichtbar — Q3 wird im Layout adressiert, nicht versteckt." },
                { kind: "con", text: "Aktions-Verteilung (Q3) nur über Stats-Bar — verliert die räumliche 'pile-shape' die Kanban gibt." },
              ]}
            />
          }
        >
          <window.ConceptB />
        </ArtboardWrap>
      </window.DCArtboard>

      <window.DCArtboard
        id="concept-c"
        label="C · Sender-Pivot, Disagreement-First (bold)"
        width={1480}
        height={1100}
      >
        <ArtboardWrap
          band={
            <ReasoningBand
              label="KONZEPT C"
              headline="Re-ordering by VALUE — Disagreement-Pile §1, Sender-Cluster §2, Singletons §3"
              tradeoffs={[
                { kind: "pro", text: "Die zwei wertvollsten Use-Cases (Disagreement + Sender-Cluster) sind HEADLINE, nicht Filter. Liest sich wie Review-Briefing." },
                { kind: "pro", text: "Sender-Cluster mit inline action-distribution macht 'suchen.immowelt 8×' und 'amazon 7×' sofort sichtbar. Long-tail kollabiert." },
                { kind: "con", text: "Bricht mit Folio's KanbanBoard-Pattern. Erfordert mehr Erklärung — neuer mental model. Drag-für-Recklassifikation kommt schlechter rein." },
              ]}
            />
          }
        >
          <window.ConceptC />
        </ArtboardWrap>
      </window.DCArtboard>
    </window.DCSection>
  </window.DesignCanvas>
);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
