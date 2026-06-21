// Concept B — Filter chips + dense list (variant)
// One-table-rules-all. Skaliert auch auf 600 Records.
//   - Sticky filter chips: Aktion / Disagreement / Sender / Date
//   - Dense row: time · sender · subject · suggested → final · confidence · markers
//   - Right rail: live stats + sender mini-list

const ConceptB = () => {
  const D = window.MAIL_DATA;
  const [actionFilter, setActionFilter] = React.useState(null);
  const [onlyDisagree, setOnlyDisagree] = React.useState(false);
  const [senderFilter, setSenderFilter] = React.useState(null);
  const [sortBy, setSortBy] = React.useState("time"); // time | confidence | disagreement

  let rows = D.rows;
  if (actionFilter) rows = rows.filter((r) => r.final_action === actionFilter);
  if (onlyDisagree) rows = rows.filter((r) => r.disagreement);
  if (senderFilter) rows = rows.filter((r) => r.from_addr === senderFilter);

  rows = [...rows].sort((a, b) => {
    if (sortBy === "confidence") return a.confidence - b.confidence;
    if (sortBy === "disagreement") return (b.disagreement ? 1 : 0) - (a.disagreement ? 1 : 0);
    return a.received_at < b.received_at ? 1 : -1;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--color-background)" }}>
      <window.ConceptHeader title="Mail-Queue · Klassifikations-Review"
        subtitle="Konzept B · Liste mit Filter-Chips" />
      <window.StatsBar disagreementToggle={{ on: onlyDisagree, setOn: setOnlyDisagree }} />

      {/* Filter chips bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "10px 24px", borderBottom: "1px solid var(--color-border)",
        background: "var(--color-card)",
      }}>
        <span style={{ fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-wider)",
          textTransform: "uppercase", color: "var(--color-muted-foreground)",
          fontWeight: 500, marginRight: 4 }}>Filter</span>
        <Chip active={actionFilter === null && !onlyDisagree && !senderFilter}
          onClick={() => { setActionFilter(null); setOnlyDisagree(false); setSenderFilter(null); }}>
          Alle · {D.total}
        </Chip>
        {D.ACTIONS.map((a) => (
          <Chip key={a} active={actionFilter === a} onClick={() => setActionFilter(actionFilter === a ? null : a)}
            tone={a === "keep" ? "slate" : a === "move_immo_portal" ? "blue" :
              a === "move_immo_privat" ? "blue-deep" : a === "move_paketzustellung" ? "amber" : "rose"}>
            {D.ACTION_LABELS[a]} · {D.counts[a]}
          </Chip>
        ))}
        <div style={{ width: 1, height: 20, background: "var(--color-border)", margin: "0 4px" }}></div>
        <Chip active={onlyDisagree} tone="ember" onClick={() => setOnlyDisagree(!onlyDisagree)}>
          ≠ Disagreement · {D.disagreements.length}
        </Chip>
        {senderFilter && (
          <Chip active={true} onClick={() => setSenderFilter(null)}>
            <span style={{ fontFamily: "var(--font-mono)" }}>{senderFilter}</span> ✕
          </Chip>
        )}
        <div style={{ flex: 1 }}></div>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted-foreground)" }}>
          Sortierung
        </span>
        <SortBtn active={sortBy === "time"} onClick={() => setSortBy("time")}>Zeit ↓</SortBtn>
        <SortBtn active={sortBy === "confidence"} onClick={() => setSortBy("confidence")}>Konfidenz ↑</SortBtn>
        <SortBtn active={sortBy === "disagreement"} onClick={() => setSortBy("disagreement")}>Disagreement zuerst</SortBtn>
      </div>

      {/* Main: list + right rail */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 280px", minHeight: 0 }}>
        {/* List */}
        <div style={{ overflowY: "auto", borderRight: "1px solid var(--color-border)" }}>
          <ListHeader />
          <div>
            {rows.map((r, i) => (
              <ListRow key={r.id} row={r} index={i}
                onSender={() => setSenderFilter(r.from_addr)} />
            ))}
          </div>
        </div>
        {/* Right rail */}
        <RightRail onSender={(s) => setSenderFilter(s)} />
      </div>
    </div>
  );
};

const Chip = ({ children, active, onClick, tone }) => {
  const toneCss = {
    slate: { bg: "hsl(210 40% 96%)", fg: "hsl(215 20% 35%)", br: "hsl(214 32% 88%)" },
    blue: { bg: "hsl(214 100% 97%)", fg: "hsl(217 91% 35%)", br: "hsl(213 97% 87%)" },
    "blue-deep": { bg: "hsl(217 91% 95%)", fg: "hsl(217 91% 25%)", br: "hsl(213 97% 82%)" },
    amber: { bg: "hsl(48 100% 96%)", fg: "hsl(20 80% 38%)", br: "hsl(45 93% 80%)" },
    rose: { bg: "hsl(0 86% 97%)", fg: "hsl(0 74% 35%)", br: "hsl(0 96% 89%)" },
    ember: { bg: "hsl(32 100% 60% / 0.12)", fg: "hsl(20 80% 38%)", br: "hsl(32 100% 60% / 0.4)" },
  };
  const t = tone ? toneCss[tone] : null;
  return (
    <button onClick={onClick} style={{
      fontSize: "var(--text-xs)", padding: "5px 11px", borderRadius: 999,
      border: active
        ? "1px solid var(--color-primary)"
        : t ? `1px solid ${t.br}` : "1px solid var(--color-border)",
      background: active ? "var(--color-primary)" : t ? t.bg : "var(--color-card)",
      color: active ? "var(--color-primary-foreground)" : t ? t.fg : "var(--color-foreground)",
      fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>{children}</button>
  );
};

const SortBtn = ({ children, active, onClick }) => (
  <button onClick={onClick} style={{
    fontSize: "var(--text-xs)", padding: "4px 9px", borderRadius: 6,
    border: "1px solid " + (active ? "var(--color-primary)" : "var(--color-border)"),
    background: active ? "var(--color-primary)" : "transparent",
    color: active ? "var(--color-primary-foreground)" : "var(--color-foreground)",
    cursor: "pointer", fontWeight: 500,
  }}>{children}</button>
);

const ListHeader = () => (
  <div style={{
    position: "sticky", top: 0, zIndex: 2,
    display: "grid",
    gridTemplateColumns: "94px 240px 1fr 200px 70px 90px",
    gap: 12, padding: "8px 24px",
    borderBottom: "1px solid var(--color-border)",
    background: "hsl(210 40% 98%)",
    fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-wider)",
    textTransform: "uppercase", color: "var(--color-muted-foreground)", fontWeight: 500,
  }}>
    <span>Empfangen</span>
    <span>Sender</span>
    <span>Betreff</span>
    <span>Aktion</span>
    <span style={{ textAlign: "right" }}>Konfidenz</span>
    <span>Marker</span>
  </div>
);

const ListRow = ({ row, index, onSender }) => {
  const dis = row.disagreement;
  const d = new Date(row.received_at);
  const dStr = d.toLocaleString("de-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "94px 240px 1fr 200px 70px 90px",
      gap: 12, padding: "10px 24px",
      borderBottom: "1px solid var(--color-border)",
      borderLeft: dis ? "3px solid hsl(32 100% 55%)" : "3px solid transparent",
      background: index % 2 === 0 ? "var(--color-card)" : "hsl(210 40% 99%)",
      alignItems: "center", cursor: "pointer",
      fontSize: "var(--text-sm)",
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)",
        color: "var(--color-muted-foreground)" }}>{dStr}</span>
      <button onClick={(e) => { e.stopPropagation(); onSender(); }}
        style={{ background: "transparent", border: "none", padding: 0, textAlign: "left",
          cursor: "pointer", overflow: "hidden" }}>
        <div style={{ fontWeight: 500, fontSize: "var(--text-sm)", lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.from_name}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5,
          color: "var(--color-muted-foreground)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.from_addr}
        </div>
      </button>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        fontWeight: 500 }}>
        {row.subject}
      </span>
      <ActionBadge row={row} />
      <span style={{ textAlign: "right" }}>
        <window.ConfidencePip value={row.confidence} />
      </span>
      <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {row.markers.slice(0, 2).map((m) => (
          <span key={m} style={{
            fontFamily: "var(--font-mono)", fontSize: 10,
            color: "var(--color-muted-foreground)",
            background: "var(--color-muted)", padding: "1px 5px", borderRadius: 4,
            whiteSpace: "nowrap",
          }}>{m}</span>
        ))}
      </span>
    </div>
  );
};

const ActionBadge = ({ row }) => {
  const D = window.MAIL_DATA;
  const dis = row.disagreement;
  const final = row.final_action;
  const sugg = row.suggested_action;

  const tone = {
    keep: "slate", move_immo_portal: "blue", move_immo_privat: "blue-deep",
    move_paketzustellung: "amber", move_zu_pruefen: "rose",
  }[final];

  const toneCss = {
    slate: { bg: "hsl(210 40% 96%)", fg: "hsl(215 20% 35%)" },
    blue: { bg: "hsl(214 100% 97%)", fg: "hsl(217 91% 35%)" },
    "blue-deep": { bg: "hsl(217 91% 95%)", fg: "hsl(217 91% 25%)" },
    amber: { bg: "hsl(48 100% 96%)", fg: "hsl(20 80% 38%)" },
    rose: { bg: "hsl(0 86% 97%)", fg: "hsl(0 74% 35%)" },
  }[tone];

  if (!dis) {
    return (
      <span style={{
        fontSize: "var(--text-xs)", fontWeight: 500,
        padding: "3px 8px", borderRadius: 6,
        background: toneCss.bg, color: toneCss.fg, display: "inline-block",
      }}>{D.ACTION_LABELS[final]}</span>
    );
  }
  // Disagreement: zeige beide
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-xs)" }}>
      <span style={{
        padding: "2px 6px", borderRadius: 4,
        background: "hsl(210 40% 96%)", color: "hsl(215 20% 50%)",
        textDecoration: "line-through", fontFamily: "var(--font-mono)", fontSize: 10.5,
      }}>{D.ACTION_SHORT[sugg]}</span>
      <span style={{ color: "hsl(20 80% 38%)", fontWeight: 700 }}>→</span>
      <span style={{
        padding: "2px 7px", borderRadius: 4, fontWeight: 600,
        background: toneCss.bg, color: toneCss.fg, fontFamily: "var(--font-mono)", fontSize: 10.5,
      }}>{D.ACTION_SHORT[final]}</span>
    </span>
  );
};

const RightRail = ({ onSender }) => {
  const D = window.MAIL_DATA;
  const topSenders = D.senders.slice(0, 10);
  return (
    <aside style={{ padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 16,
      background: "var(--color-card)", overflowY: "auto" }}>
      {/* Live status */}
      <section style={{
        border: "1px solid var(--color-border)", borderRadius: 12, padding: 14,
        background: "var(--color-card)",
      }}>
        <div style={{ fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-wider)",
          textTransform: "uppercase", color: "var(--color-muted-foreground)", fontWeight: 500,
          marginBottom: 8 }}>Worker</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--text-sm)" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--color-muted-foreground)" }}>Status</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "hsl(142 71% 45%)" }}></span>
              aktiv
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--color-muted-foreground)" }}>SSE</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>connected</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--color-muted-foreground)" }}>Heartbeat</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>vor 14s</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--color-muted-foreground)" }}>Rate</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>≈ 1 / 40s</span>
          </div>
        </div>
      </section>

      {/* Top sender */}
      <section>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between",
          marginBottom: 8 }}>
          <span style={{ fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-wider)",
            textTransform: "uppercase", color: "var(--color-muted-foreground)", fontWeight: 500 }}>
            Top-Sender
          </span>
          <span style={{ fontSize: 10, color: "var(--color-muted-foreground)",
            fontFamily: "var(--font-mono)" }}>
            {D.senders.length} unique
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {topSenders.map((s) => (
            <SenderMini key={s.from_addr} s={s} onClick={() => onSender(s.from_addr)} />
          ))}
        </div>
      </section>
    </aside>
  );
};

const SenderMini = ({ s, onClick }) => {
  const D = window.MAIL_DATA;
  const maxBar = 16;
  const total = s.count;
  return (
    <button onClick={onClick} style={{
      display: "grid", gridTemplateColumns: "1fr 24px", gap: 6,
      alignItems: "center", padding: "6px 8px",
      borderRadius: 6, border: "1px solid transparent",
      background: "transparent", cursor: "pointer", textAlign: "left",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.from_name}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5,
          color: "var(--color-muted-foreground)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.from_addr}
        </div>
        <div style={{ display: "flex", gap: 1, marginTop: 3, height: 4 }}>
          {D.ACTIONS.map((a) => {
            const n = s.actions[a];
            if (!n) return null;
            const w = (n / total) * 100;
            const c = { keep: "hsl(215 20% 60%)", move_immo_portal: "hsl(217 91% 60%)",
              move_immo_privat: "hsl(217 91% 40%)", move_paketzustellung: "hsl(32 100% 55%)",
              move_zu_pruefen: "hsl(0 74% 55%)" }[a];
            return <span key={a} style={{ width: `${w}%`, background: c }}></span>;
          })}
        </div>
      </div>
      <div style={{ textAlign: "right", fontSize: "var(--text-sm)", fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        color: s.disagreements > 0 ? "hsl(20 80% 38%)" : "var(--color-foreground)" }}>
        {s.count}
      </div>
    </button>
  );
};

window.ConceptB = ConceptB;
window.SenderMini = SenderMini;
window.ActionBadge = ActionBadge;
window.Chip = Chip;
