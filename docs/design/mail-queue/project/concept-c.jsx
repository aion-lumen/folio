// Concept C — Sender-Pivot, Disagreement-First (mutiger Vorschlag)
//
// Re-ordering by VALUE statt by chronology:
//   1. Disagreement-Pile — die ~6 wertvollen Signal-Mails, expanded cards
//      mit Heuristik-vs-User-Diff seite-an-seite
//   2. Sender-Cluster — Top-Sender mit Frequenz + Action-Verteilung, expandable
//   3. Long-Tail — Single-shot Sender, gesammelt am Boden
//
// These match the prompt's primary use-cases #1 (disagreement) und #2 (sender-cluster)
// als HEADLINE statt versteckt in einem Filter.

const ConceptC = () => {
  const D = window.MAIL_DATA;
  const topSenders = D.senders.filter((s) => s.count >= 2);
  const longTail = D.senders.filter((s) => s.count === 1);
  const [expandedSender, setExpandedSender] = React.useState(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--color-background)" }}>
      <window.ConceptHeader title="Mail-Queue · Klassifikations-Review"
        subtitle="Konzept C · Sender-Pivot, Disagreement-First" />
      <window.StatsBar disagreementToggle={{ on: false, setOn: () => {} }} />

      <div style={{
        flex: 1, overflowY: "auto", padding: "24px 32px 40px",
        background: "hsl(210 40% 99%)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>

          {/* ── §1 Disagreement-Pile ─────────────────────────────────────── */}
          <SectionHead
            num="01"
            title="Disagreement-Pile"
            sub={`${D.disagreements.length} Mails wo User von Heuristik abweicht — das wertvolle Signal`}
            accent="ember"
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
            gap: 16 }}>
            {D.disagreements.map((r) => (
              <DisagreementCard key={r.id} row={r} />
            ))}
          </div>

          {/* ── §2 Sender-Cluster ────────────────────────────────────────── */}
          <SectionHead
            num="02"
            title="Sender-Cluster"
            sub={`${topSenders.length} Sender mit ≥2 Mails · ${topSenders.reduce((s, x) => s + x.count, 0)} Mails total`}
            accent="slate"
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topSenders.map((s) => (
              <SenderClusterRow key={s.from_addr} sender={s}
                expanded={expandedSender === s.from_addr}
                onToggle={() => setExpandedSender(expandedSender === s.from_addr ? null : s.from_addr)} />
            ))}
          </div>

          {/* ── §3 Long Tail ─────────────────────────────────────────────── */}
          <SectionHead
            num="03"
            title="Singletons"
            sub={`${longTail.length} Sender mit nur 1 Mail · kollabiert per default`}
            accent="slate"
          />
          <SingletonStrip senders={longTail} />

        </div>
      </div>
    </div>
  );
};

// ─── Section Header ────────────────────────────────────────────────────────
const SectionHead = ({ num, title, sub, accent }) => {
  const accentColor = accent === "ember" ? "hsl(20 80% 38%)" : "var(--color-foreground)";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 16,
      paddingBottom: 12, borderBottom: "1px solid var(--color-border)" }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)",
        color: "var(--color-muted-foreground)", letterSpacing: "var(--tracking-wider)",
      }}>{num}</span>
      <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 700,
        letterSpacing: "var(--tracking-tight)", color: accentColor, margin: 0 }}>
        {title}
      </h2>
      <span style={{ fontSize: "var(--text-sm)", color: "var(--color-muted-foreground)" }}>
        {sub}
      </span>
    </div>
  );
};

// ─── §1 Disagreement Card ──────────────────────────────────────────────────
const DisagreementCard = ({ row }) => {
  const D = window.MAIL_DATA;
  const dStr = new Date(row.received_at).toLocaleString("de-CH",
    { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{
      background: "var(--color-card)",
      border: "1px solid hsl(32 100% 60% / 0.35)",
      boxShadow: "0 0 0 3px hsl(32 100% 60% / 0.08)",
      borderRadius: 12, padding: 16,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* head */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5,
            color: "var(--color-muted-foreground)", marginBottom: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.from_addr}
          </div>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, lineHeight: 1.3 }}>
            {row.subject}
          </div>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10,
          color: "var(--color-muted-foreground)", whiteSpace: "nowrap" }}>{dStr}</div>
      </div>

      {/* diff: suggested vs final */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "stretch",
        padding: 10, background: "hsl(210 40% 98%)",
        border: "1px solid var(--color-border)", borderRadius: 8,
      }}>
        <DiffSide
          label="Heuristik schlug vor"
          value={D.ACTION_LABELS[row.suggested_action]}
          confidence={row.confidence}
          fade
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, color: "hsl(20 80% 38%)", fontWeight: 700 }}>→</div>
        <DiffSide
          label="User wählte"
          value={D.ACTION_LABELS[row.final_action]}
          response_ms={row.response_ms}
        />
      </div>

      {/* evidence + reason */}
      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-muted-foreground)",
        lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 4 }}>
        <div><strong style={{ color: "var(--color-foreground)", fontWeight: 500 }}>Evidence:</strong> {row.evidence}</div>
        <div><strong style={{ color: "var(--color-foreground)", fontWeight: 500 }}>Reason:</strong> {row.reason}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          {row.markers.map((m) => (
            <span key={m} style={{
              fontFamily: "var(--font-mono)", fontSize: 10,
              padding: "1px 5px", borderRadius: 4,
              background: "var(--color-muted)", color: "var(--color-muted-foreground)",
            }}>{m}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

const DiffSide = ({ label, value, confidence, response_ms, fade }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, opacity: fade ? 0.75 : 1 }}>
    <div style={{ fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-wider)",
      textTransform: "uppercase", color: "var(--color-muted-foreground)", fontWeight: 500 }}>
      {label}
    </div>
    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600,
      textDecoration: fade ? "line-through" : "none",
      color: fade ? "var(--color-muted-foreground)" : "var(--color-foreground)" }}>
      {value}
    </div>
    {typeof confidence === "number" && <window.ConfidencePip value={confidence} />}
    {typeof response_ms === "number" && (
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10,
        color: "var(--color-muted-foreground)" }}>
        Entscheid in {(response_ms / 1000).toFixed(1)}s
      </span>
    )}
  </div>
);

// ─── §2 Sender Cluster Row ─────────────────────────────────────────────────
const SenderClusterRow = ({ sender, expanded, onToggle }) => {
  const D = window.MAIL_DATA;
  const max = D.senders[0].count;
  const senderMails = D.rows.filter((r) => r.from_addr === sender.from_addr);
  const dis = sender.disagreements;

  return (
    <div style={{
      background: "var(--color-card)",
      border: "1px solid var(--color-border)",
      borderLeft: dis > 0 ? "3px solid hsl(32 100% 55%)" : "3px solid transparent",
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <button onClick={onToggle} style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr 240px 80px 32px",
        gap: 16, padding: "12px 16px", width: "100%",
        background: "transparent", border: "none", cursor: "pointer",
        alignItems: "center", textAlign: "left",
      }}>
        {/* sender */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sender.from_name}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5,
            color: "var(--color-muted-foreground)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sender.from_addr}
          </div>
        </div>

        {/* frequency bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            display: "block", height: 8, width: `${(sender.count / max) * 100}%`,
            minWidth: 24,
            background: "hsl(222 47% 11%)", borderRadius: 4,
          }}></span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)",
            color: "var(--color-muted-foreground)" }}>
            {sender.count}× über {daysSpan(senderMails)} Tage
          </span>
        </div>

        {/* action distribution */}
        <ActionDistribution sender={sender} />

        {/* disagreement count */}
        <div style={{ textAlign: "right" }}>
          {dis > 0 ? (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: "var(--text-xs)", fontWeight: 600, color: "hsl(20 80% 38%)",
              background: "hsl(32 100% 60% / 0.12)", border: "1px solid hsl(32 100% 60% / 0.3)",
              padding: "2px 7px", borderRadius: 999,
            }}>≠ {dis}</span>
          ) : (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted-foreground)" }}>—</span>
          )}
        </div>

        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14,
          color: "var(--color-muted-foreground)" }}>{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--color-border)",
          background: "hsl(210 40% 98%)" }}>
          {senderMails.map((r) => (
            <SenderMailRow key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
};

const daysSpan = (mails) => {
  if (mails.length === 0) return 0;
  const ds = mails.map((r) => new Date(r.received_at).getTime());
  return Math.max(1, Math.ceil((Math.max(...ds) - Math.min(...ds)) / (24 * 3600 * 1000))) || 1;
};

const ActionDistribution = ({ sender }) => {
  const D = window.MAIL_DATA;
  const colors = {
    keep: "hsl(215 20% 55%)", move_immo_portal: "hsl(217 91% 60%)",
    move_immo_privat: "hsl(217 91% 40%)", move_paketzustellung: "hsl(32 100% 55%)",
    move_zu_pruefen: "hsl(0 74% 55%)",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", height: 6, borderRadius: 999, overflow: "hidden" }}>
        {D.ACTIONS.map((a) => {
          const n = sender.actions[a];
          if (!n) return null;
          return <span key={a} title={`${a}: ${n}`}
            style={{ flex: n, background: colors[a] }}></span>;
        })}
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 10, fontFamily: "var(--font-mono)",
        color: "var(--color-muted-foreground)" }}>
        {D.ACTIONS.filter((a) => sender.actions[a]).map((a) => (
          <span key={a} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: colors[a] }}></span>
            {D.ACTION_SHORT[a]} · {sender.actions[a]}
          </span>
        ))}
      </div>
    </div>
  );
};

const SenderMailRow = ({ row }) => {
  const D = window.MAIL_DATA;
  const dStr = new Date(row.received_at).toLocaleString("de-CH",
    { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "100px 1fr 180px 70px",
      gap: 12, padding: "8px 16px 8px 32px",
      borderBottom: "1px solid var(--color-border)",
      alignItems: "center",
      fontSize: "var(--text-sm)",
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5,
        color: "var(--color-muted-foreground)" }}>{dStr}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {row.subject}
      </span>
      <window.ActionBadge row={row} />
      <span style={{ textAlign: "right" }}>
        <window.ConfidencePip value={row.confidence} />
      </span>
    </div>
  );
};

// ─── §3 Singletons ─────────────────────────────────────────────────────────
const SingletonStrip = ({ senders }) => {
  const [open, setOpen] = React.useState(false);
  const preview = senders.slice(0, 12);
  return (
    <div style={{
      background: "var(--color-card)", border: "1px solid var(--color-border)",
      borderRadius: 8, padding: 12,
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(open ? senders : preview).map((s) => (
          <span key={s.from_addr} style={{
            fontFamily: "var(--font-mono)", fontSize: 10.5,
            padding: "3px 8px", borderRadius: 999,
            background: s.disagreements > 0 ? "hsl(32 100% 60% / 0.12)" : "var(--color-muted)",
            color: s.disagreements > 0 ? "hsl(20 80% 38%)" : "var(--color-muted-foreground)",
            border: s.disagreements > 0 ? "1px solid hsl(32 100% 60% / 0.3)" : "1px solid transparent",
          }}>
            {s.from_addr}
          </span>
        ))}
      </div>
      {senders.length > 12 && (
        <button onClick={() => setOpen(!open)} style={{
          marginTop: 10, fontSize: "var(--text-xs)", fontWeight: 500,
          color: "var(--color-primary)", background: "transparent", border: "none",
          padding: 0, cursor: "pointer",
        }}>
          {open ? "weniger" : `+ ${senders.length - preview.length} weitere zeigen`}
        </button>
      )}
    </div>
  );
};

window.ConceptC = ConceptC;
