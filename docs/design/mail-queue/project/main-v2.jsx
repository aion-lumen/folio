// Folio Mail-Queue · Iter 2 · canvas composition
// Three artboards: All-Accounts, Single-Account, Drawer-Comparison

// ─────────────────────────────────────────────────────────────────────────
// Helper: pick representative rows for the drawer-comparison artboard
const pickDrawerRows = () => {
  const data = window.MAIL_DATA;
  // Find a juicy disagreement (century21 newsletter)
  const disagree =
    data.rows.find((r) =>
      r.from_addr.includes("century21") && r.subject.includes("Exklusive")) ||
    data.rows.find((r) => r.disagreement);
  // Find a clean normal (amazon paketzustellung)
  const normal =
    data.rows.find((r) =>
      r.from_addr === "order-update@amazon.de" &&
      r.final_action === "move_paketzustellung" &&
      r.subject.includes("Geliefert")) ||
    data.rows.find((r) => !r.disagreement && r.final_action === "move_paketzustellung");
  return { disagree, normal };
};

// ─────────────────────────────────────────────────────────────────────────
// Reasoning band — same pattern as Iter 1, but reading more like a brief
const ReasoningBandV2 = ({ label, headline, sub, notes }) => (
  <div style={{
    padding: "14px 28px 12px",
    borderBottom: "1px solid var(--color-border)",
    background: "hsl(210 40% 98.5%)",
    display: "flex", alignItems: "flex-start", gap: 32,
  }}>
    <div style={{ minWidth: 160 }}>
      <div className="eyebrow" style={{ marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em",
        lineHeight: 1.3 }}>{headline}</div>
      {sub && <div style={{ fontSize: 11.5,
        color: "var(--color-muted-foreground)", marginTop: 4, lineHeight: 1.45 }}>{sub}</div>}
    </div>
    <div style={{ flex: 1, display: "grid",
      gridTemplateColumns: `repeat(${notes.length}, 1fr)`, gap: 18,
      fontSize: 11.5, lineHeight: 1.5 }}>
      {notes.map((n, i) => (
        <div key={i} style={{ display: "flex", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600,
            color: n.kind === "pro" ? "hsl(142 72% 29%)" :
                   n.kind === "con" ? "hsl(0 74% 38%)" : "var(--color-muted-foreground)",
            whiteSpace: "nowrap", flexShrink: 0 }}>
            {n.kind === "pro" ? "✓" : n.kind === "con" ? "✗" : "○"}
          </span>
          <span style={{ color: "var(--color-foreground)" }}>{n.text}</span>
        </div>
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────
// Artboard 3 wrapper: two drawer panels side-by-side
const DrawerCompareArtboard = () => {
  const { disagree, normal } = pickDrawerRows();
  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "var(--color-background)",
    }}>
      <ReasoningBandV2
        label="ARTBOARD 03"
        headline="Detail-Drawer · Disagreement-Mail vs Normal-Mail"
        sub="Drawer öffnet bei Row-Click rechts. Beide States nebeneinander zum Vergleich."
        notes={[
          { kind: "pro", text: "Disagreement-State macht Heuristik-vs-User-Diff zentral: ehrliches Tooling für Heuristik-Refinement." },
          { kind: "pro", text: "Normal-State bleibt ruhig — kein dramatisches Warning, klassische Mail-Detail-Lesbarkeit." },
          { kind: "warn", text: "Re-Classify + Mail-Öffnen sind Phase-2-Placeholders (disabled). Drawer-Width = 440px (konsistent über alle Mockups)." },
        ]}
      />
      <div style={{
        flex: 1, padding: 32,
        background: "hsl(210 40% 99%)",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24,
        minHeight: 0,
      }}>
        <DrawerExhibit
          label="DISAGREEMENT"
          context="Aus /mail-queue · Klick auf Row mit Disagreement-Marker"
          row={disagree}
        />
        <DrawerExhibit
          label="NORMAL"
          context="Aus /mail-queue · Klick auf bestätigte Row"
          row={normal}
        />
      </div>
    </div>
  );
};

const DrawerExhibit = ({ label, context, row }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
        padding: "2px 7px", borderRadius: 4,
        background: label === "DISAGREEMENT" ? "hsl(32 100% 60% / 0.16)" : "hsl(214 32% 92%)",
        color: label === "DISAGREEMENT" ? "hsl(20 80% 38%)" : "hsl(222 47% 18%)",
      }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--color-muted-foreground)" }}>{context}</span>
    </div>
    <div style={{
      flex: 1, minHeight: 0,
      width: 440, maxWidth: 440,
      border: "1px solid var(--color-border)",
      borderRadius: 12, overflow: "hidden",
      background: "var(--color-card)",
      boxShadow: "0 10px 30px -12px rgba(0,0,0,0.10)",
      display: "flex", flexDirection: "column",
    }}>
      <window.DetailDrawer row={row} onClose={() => {}} />
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────
// App root
const AppV2 = () => {
  const data = window.MAIL_DATA;
  return (
    <window.DesignCanvas
      title="Folio · Mail-Queue · Iteration 2"
      subtitle={
        `Konzept B verfeinert · Multi-Account · Hi-Fi mit Aion-Lumen-Tokens · ` +
        `${window.fmtNum(data.total)} Records über ${data.ACCOUNTS.length} Accounts ` +
        `· ${data.disagreements.length} Disagreements`
      }
    >
      <window.DCSection
        id="iter-2"
        title="Iteration 2 — Multi-Account Mail-Queue"
        subtitle="Drei States: Alle-Accounts · gmail isoliert · Detail-Drawer (Disagreement vs Normal)"
        gap={72}
      >
        {/* Artboard 1 — All Accounts */}
        <window.DCArtboard
          id="ab1-all"
          label="01 · Alle Accounts (Account-Spalte sichtbar)"
          width={1620}
          height={1100}
        >
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <ReasoningBandV2
              label="ARTBOARD 01"
              headline="Default-State · alle 3 Accounts · Account-Spalte sichtbar"
              sub="Account-Buttons + inline Mini-Stats in einer Zeile (Hierarchie > Aktion-Filter). Keine separate Karten-Sektion mehr."
              notes={[
                { kind: "pro", text: "Account-Auswahl + Live-Stats kombiniert: '58% keep · 11 disagreements · Heartbeat vor 14s' — ein Blick genügt." },
                { kind: "pro", text: "Color-Coding gmail-blau · yahoo-lila · mirhamed.ch-grün wird in Liste-Acct-Spalte konsistent wiederholt." },
                { kind: "warn", text: "Disagreement-Count in der Inline-Stats-Zeile ist klickbar — isoliert die Liste auf nur Disagreement-Rows." },
              ]}
            />
            <div style={{ flex: 1, minHeight: 0 }}>
              <window.MailQueueView />
            </div>
          </div>
        </window.DCArtboard>

        {/* Artboard 2 — Single Account (gmail) */}
        <window.DCArtboard
          id="ab2-gmail"
          label="02 · gmail isoliert (Account-Spalte ausgeblendet)"
          width={1620}
          height={1100}
        >
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <ReasoningBandV2
              label="ARTBOARD 02"
              headline="Single-Account · gmail isoliert"
              sub="Account-Spalte verschwindet (redundant). Inline-Stats und Aktion-Counts werden scoped. Header zeigt gmail-Pill."
              notes={[
                { kind: "pro", text: "Wechsel zurück zu 'Alle' via Account-Button — Single-Click. Klar-saturiertes gmail-blau im Header-Pill macht den Scope unmissverständlich." },
                { kind: "pro", text: "'scoped'-Pille rechts in der Inline-Stats-Zeile + scoped Aktion-Counts: kein Verwechslungs-Risiko mit globalem Total." },
                { kind: "warn", text: "Sender-Rail zeigt nur gmail-Sender, ohne Multi-Account-Dots (eine Account-Quelle, also redundant)." },
              ]}
            />
            <div style={{ flex: 1, minHeight: 0 }}>
              <window.MailQueueView initialAccount="gmail" />
            </div>
          </div>
        </window.DCArtboard>

        {/* Artboard 3 — Drawer comparison */}
        <window.DCArtboard
          id="ab3-drawer"
          label="03 · Detail-Drawer · Disagreement vs Normal"
          width={1100}
          height={1100}
        >
          <DrawerCompareArtboard />
        </window.DCArtboard>
      </window.DCSection>
    </window.DesignCanvas>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<AppV2 />);
