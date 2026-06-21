// Concept A — Kanban (safe pick · Folio-DNA)
// Mirrors life-dashboard's KanbanBoard.svelte vocabulary:
//   - 5 columns, one per final_action
//   - Tinted column surfaces (slate-50 / blue-50 / etc.)
//   - rounded-xl cards with monospace id, semibold title
//   - Disagreement = ring-2 ring-primary + small badge

const ConceptA = () => {
  const D = window.MAIL_DATA;
  const [filterDisagree, setFilterDisagree] = React.useState(false);

  const cols = [
    { id: "keep", tone: "slate" },
    { id: "move_immo_portal", tone: "blue" },
    { id: "move_immo_privat", tone: "blue-deep" },
    { id: "move_paketzustellung", tone: "amber" },
    { id: "move_zu_pruefen", tone: "rose" },
  ];

  const toneCss = {
    slate: { bg: "hsl(210 40% 98%)", br: "hsl(214 32% 91%)", dot: "hsl(215 20% 45%)" },
    blue: { bg: "hsl(214 100% 97%)", br: "hsl(213 97% 87%)", dot: "hsl(217 91% 60%)" },
    "blue-deep": { bg: "hsl(217 91% 95%)", br: "hsl(213 97% 82%)", dot: "hsl(217 91% 45%)" },
    amber: { bg: "hsl(48 100% 96%)", br: "hsl(45 93% 80%)", dot: "hsl(32 100% 50%)" },
    rose: { bg: "hsl(0 86% 97%)", br: "hsl(0 96% 89%)", dot: "hsl(0 74% 50%)" },
  };

  const rowsForCol = (a) => {
    let r = D.rows.filter((x) => x.final_action === a);
    if (filterDisagree) r = r.filter((x) => x.disagreement);
    return r;
  };

  const fmtTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString("de-CH", {
      day: "2-digit", month: "short",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--color-background)" }}>
      <ConceptHeader title="Mail-Queue · Klassifikations-Review" subtitle="Konzept A · Kanban (5 Spalten = 5 Aktionen)" />
      <StatsBar disagreementToggle={{ on: filterDisagree, setOn: setFilterDisagree }} />

      <div style={{
        flex: 1, display: "flex", gap: 16, padding: "16px 24px 24px",
        overflowX: "auto", background: "hsl(210 40% 99%)",
      }}>
        {cols.map((col) => {
          const tone = toneCss[col.tone];
          const items = rowsForCol(col.id);
          return (
            <div key={col.id} style={{ flex: "0 0 280px", display: "flex", flexDirection: "column", minWidth: 0 }}>
              {/* column head */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "4px 4px 8px", borderBottom: "1px solid var(--color-border)",
                marginBottom: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 999, background: tone.dot,
                  }}></span>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                    {D.ACTION_LABELS[col.id]}
                  </span>
                </div>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)",
                  color: "var(--color-muted-foreground)",
                  background: "var(--color-muted)", padding: "2px 7px", borderRadius: 999,
                }}>{items.length}</span>
              </div>

              {/* card stack */}
              <div style={{
                flex: 1, padding: 8, background: tone.bg,
                border: `1px solid ${tone.br}`, borderRadius: 12,
                display: "flex", flexDirection: "column", gap: 6,
                overflowY: "auto", maxHeight: 1180,
              }}>
                {items.map((r) => (
                  <MailCard key={r.id} row={r} fmtTime={fmtTime} />
                ))}
                {items.length === 0 && (
                  <div style={{ padding: 16, textAlign: "center", color: "var(--color-muted-foreground)", fontSize: "var(--text-xs)" }}>
                    keine Mails
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MailCard = ({ row, fmtTime }) => {
  const dis = row.disagreement;
  return (
    <div style={{
      background: "white",
      border: dis ? "1px solid hsl(20 80% 38% / 0.4)" : "1px solid var(--color-border)",
      boxShadow: dis ? "0 0 0 2px hsl(32 100% 60% / 0.18)" : "var(--shadow-xs)",
      borderRadius: 8,
      padding: 10,
      display: "flex", flexDirection: "column", gap: 4,
      cursor: "pointer",
    }}>
      {/* sender · time */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10.5,
          color: "var(--color-muted-foreground)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180,
        }}>{row.from_addr}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>
          {fmtTime(row.received_at).split(",")[0]}
        </span>
      </div>
      {/* subject */}
      <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, lineHeight: 1.3, color: "var(--color-foreground)" }}>
        {row.subject}
      </div>
      {/* meta row: confidence + disagreement marker */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
        <ConfidencePip value={row.confidence} />
        {dis && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10.5, color: "hsl(20 80% 38%)", fontWeight: 600,
            background: "hsl(32 100% 60% / 0.12)", border: "1px solid hsl(32 100% 60% / 0.3)",
            padding: "1px 6px", borderRadius: 999,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: "hsl(32 100% 55%)" }}></span>
            ≠ {D_short(row.suggested_action)}
          </span>
        )}
      </div>
    </div>
  );
};

const D_short = (a) => window.MAIL_DATA.ACTION_SHORT[a];

const ConfidencePip = ({ value }) => {
  const pct = Math.round(value * 100);
  const low = value < 0.6;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontFamily: "var(--font-mono)", fontSize: 10,
      color: low ? "hsl(0 74% 42%)" : "var(--color-muted-foreground)",
    }}>
      <span style={{
        width: 22, height: 4, borderRadius: 2,
        background: "var(--color-muted)", position: "relative", overflow: "hidden",
      }}>
        <span style={{
          position: "absolute", inset: 0, width: `${pct}%`,
          background: low ? "hsl(0 74% 50%)" : "hsl(222 47% 11%)",
        }}></span>
      </span>
      {pct}%
    </span>
  );
};

const ConceptHeader = ({ title, subtitle }) => (
  <div style={{
    padding: "16px 24px 12px", borderBottom: "1px solid var(--color-border)",
    display: "flex", alignItems: "baseline", justifyContent: "space-between",
    background: "var(--color-card)",
  }}>
    <div>
      <div style={{ fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-wider)",
        textTransform: "uppercase", color: "var(--color-muted-foreground)", fontWeight: 500, marginBottom: 4 }}>
        Folio · /mail-queue
      </div>
      <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, letterSpacing: "var(--tracking-tight)" }}>
        {title}
      </div>
    </div>
    <div style={{ fontSize: "var(--text-xs)", color: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)" }}>
      {subtitle}
    </div>
  </div>
);

const StatsBar = ({ disagreementToggle }) => {
  const D = window.MAIL_DATA;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 24,
      padding: "12px 24px", borderBottom: "1px solid var(--color-border)",
      background: "var(--color-card)",
    }}>
      <Stat label="Total" value={D.total} />
      <Stat label="Behalten" value={D.counts.keep} tone="slate" />
      <Stat label="Immo · Portal" value={D.counts.move_immo_portal} tone="blue" />
      <Stat label="Immo · Privat" value={D.counts.move_immo_privat} tone="blue-deep" />
      <Stat label="Pakete" value={D.counts.move_paketzustellung} tone="amber" />
      <Stat label="Zu prüfen" value={D.counts.move_zu_pruefen} tone="rose" />
      <div style={{ width: 1, height: 32, background: "var(--color-border)" }}></div>
      <DisagreementStat count={D.disagreements.length} toggle={disagreementToggle} />
      <div style={{ flex: 1 }}></div>
      <LiveIndicator />
    </div>
  );
};

const Stat = ({ label, value, tone }) => {
  const dots = {
    slate: "hsl(215 20% 45%)", blue: "hsl(217 91% 60%)",
    "blue-deep": "hsl(217 91% 45%)", amber: "hsl(32 100% 50%)",
    rose: "hsl(0 74% 50%)",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {tone && <span style={{ width: 6, height: 6, borderRadius: 999, background: dots[tone] }}></span>}
        <span style={{ fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-wider)",
          textTransform: "uppercase", color: "var(--color-muted-foreground)", fontWeight: 500 }}>{label}</span>
      </div>
      <span style={{ fontSize: "var(--text-xl)", fontWeight: 700, lineHeight: 1,
        fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
};

const DisagreementStat = ({ count, toggle }) => (
  <button
    onClick={() => toggle.setOn(!toggle.on)}
    style={{
      display: "flex", flexDirection: "column", gap: 2, cursor: "pointer",
      background: toggle.on ? "hsl(32 100% 60% / 0.12)" : "transparent",
      border: toggle.on ? "1px solid hsl(32 100% 60% / 0.4)" : "1px solid transparent",
      padding: "4px 10px", borderRadius: 8, transition: "background 150ms",
      alignItems: "flex-start", textAlign: "left",
    }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: "hsl(32 100% 55%)" }}></span>
      <span style={{ fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-wider)",
        textTransform: "uppercase", color: "hsl(20 80% 38%)", fontWeight: 600 }}>Disagreement</span>
    </div>
    <span style={{ fontSize: "var(--text-xl)", fontWeight: 700, lineHeight: 1,
      color: "hsl(20 80% 38%)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
    <span style={{ fontSize: 10, color: "var(--color-muted-foreground)" }}>
      {toggle.on ? "Filter aktiv · klicken zum Lösen" : "klicken um zu isolieren"}
    </span>
  </button>
);

const LiveIndicator = () => (
  <div style={{
    display: "flex", alignItems: "center", gap: 8,
    padding: "6px 12px", border: "1px solid var(--color-border)",
    borderRadius: 999, background: "var(--color-card)",
  }}>
    <span style={{ position: "relative", width: 8, height: 8 }}>
      <span style={{
        position: "absolute", inset: 0, borderRadius: 999,
        background: "hsl(142 71% 45%)",
      }}></span>
      <span style={{
        position: "absolute", inset: -3, borderRadius: 999,
        background: "hsl(142 71% 45% / 0.3)",
        animation: "pulse 2s ease-out infinite",
      }}></span>
    </span>
    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-foreground)", fontWeight: 500 }}>
      Live · Worker aktiv
    </span>
    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted-foreground)",
      fontFamily: "var(--font-mono)" }}>
      letzter Heartbeat · vor 14s
    </span>
  </div>
);

window.ConceptA = ConceptA;
window.ConceptHeader = ConceptHeader;
window.StatsBar = StatsBar;
window.LiveIndicator = LiveIndicator;
window.ConfidencePip = ConfidencePip;
window.Stat = Stat;
