// Folio Mail-Queue · Iter 2 · shared atoms
// (ConfidencePip, AccountDot, ActionBadge, LiveIndicator, helpers)

const ACTION_TONES = {
  keep: {
    bg: "hsl(210 40% 96%)", fg: "hsl(215 25% 35%)", br: "hsl(214 32% 86%)",
    dot: "hsl(215 20% 55%)",
  },
  move_immo_portal: {
    bg: "hsl(214 100% 97%)", fg: "hsl(217 91% 30%)", br: "hsl(213 97% 84%)",
    dot: "hsl(217 91% 60%)",
  },
  move_immo_privat: {
    bg: "hsl(217 91% 95%)", fg: "hsl(217 91% 22%)", br: "hsl(213 97% 80%)",
    dot: "hsl(217 91% 38%)",
  },
  move_paketzustellung: {
    bg: "hsl(38 100% 96%)", fg: "hsl(22 85% 35%)", br: "hsl(38 90% 80%)",
    dot: "hsl(32 100% 52%)",
  },
  move_zu_pruefen: {
    bg: "hsl(0 86% 97%)", fg: "hsl(0 74% 32%)", br: "hsl(0 96% 88%)",
    dot: "hsl(0 74% 52%)",
  },
};

// Account-Palette (Iter 2 · Architekt-Wahl): gmail blau · yahoo lila · mirhamed.ch grün.
// Bewusst getrennt von den semantischen Action-Blautönen (immo_portal 217°);
// gmail nutzt ein klar-saturiertes Blau bei ~215° aber differenzierter
// Lightness/Stroke, damit Account vs Aktion in der Liste nicht kollidieren.
const ACCOUNT_COLORS = {
  gmail:        { dot: "hsl(215 80% 50%)", soft: "hsl(215 80% 96%)", deep: "hsl(215 80% 30%)" },
  yahoo:        { dot: "hsl(280 60% 54%)", soft: "hsl(280 50% 96%)", deep: "hsl(280 65% 32%)" },
  mirhamed_ch:  { dot: "hsl(158 62% 38%)", soft: "hsl(158 40% 95%)", deep: "hsl(160 75% 22%)" },
};

const fmtNum = (n) => {
  // Swiss apostrophe-style number formatting
  if (n < 1000) return String(n);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
};

const fmtTime = (iso, opts = {}) => {
  const d = new Date(iso);
  const now = window.MAIL_DATA.NOW;
  const sameDay = d.toDateString() === now.toDateString();
  if (opts.short) {
    return sameDay
      ? d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("de-CH", { day: "2-digit", month: "short" });
  }
  return d.toLocaleString("de-CH", {
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

// ─────────────────────────────────────────────────────────────────────────
// Confidence Pip — slim bar + tabular number
const ConfidencePipV2 = ({ value, width = 28 }) => {
  const pct = Math.round(value * 100);
  const low = value < 0.6;
  const mid = value < 0.78;
  const color = low ? "hsl(0 74% 50%)" : mid ? "hsl(32 95% 48%)" : "hsl(222 47% 18%)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: "var(--font-mono)", fontSize: 11,
      color: low ? "hsl(0 74% 38%)" : "var(--color-muted-foreground)",
      fontVariantNumeric: "tabular-nums",
    }}>
      <span style={{ width, height: 3, borderRadius: 999,
        background: "hsl(214 32% 92%)", position: "relative", overflow: "hidden", display: "inline-block" }}>
        <span style={{ position: "absolute", inset: 0, width: `${pct}%`,
          background: color, borderRadius: 999 }}></span>
      </span>
      <span>{pct}</span>
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Tier indicator — 1 (hard) · 2 (plugin) · 3 (user-only)
const TierChip = ({ tier }) => {
  const tones = {
    1: { bg: "hsl(214 32% 94%)", fg: "hsl(222 47% 18%)", label: "T1" },
    2: { bg: "hsl(214 32% 94%)", fg: "hsl(215 16% 47%)", label: "T2" },
    3: { bg: "hsl(0 86% 97%)", fg: "hsl(0 74% 38%)", label: "T3" },
  };
  const t = tones[tier] || tones[2];
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500,
      padding: "1px 6px", borderRadius: 4,
      background: t.bg, color: t.fg,
    }}>{t.label}</span>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Account dot/chip
const AccountDot = ({ accountId, size = 8 }) => {
  const c = ACCOUNT_COLORS[accountId];
  return (
    <span style={{
      display: "inline-block", width: size, height: size, borderRadius: 999,
      background: c.dot, flexShrink: 0,
    }}></span>
  );
};

const AccountChip = ({ accountId, label }) => {
  const c = ACCOUNT_COLORS[accountId];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 7px 2px 6px", borderRadius: 4,
      background: c.soft, color: c.deep,
      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: c.dot }}></span>
      {label || accountId}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Action badge — pill, with disagreement inline-diff variant
const ActionBadgeV2 = ({ row, compact = false }) => {
  const D = window.MAIL_DATA;
  const final = row.final_action;
  const tone = ACTION_TONES[final];

  if (!row.disagreement) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 12, fontWeight: 500,
        padding: "3px 9px 3px 7px", borderRadius: 6,
        background: tone.bg, color: tone.fg,
        lineHeight: 1.3, whiteSpace: "nowrap",
      }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: tone.dot }}></span>
        {compact ? D.ACTION_SHORT[final] : D.ACTION_LABELS[final]}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
      <span style={{
        padding: "2px 6px", borderRadius: 4,
        background: "hsl(214 32% 94%)", color: "hsl(215 20% 50%)",
        textDecoration: "line-through",
      }}>{D.ACTION_SHORT[row.suggested_action]}</span>
      <span style={{ color: "hsl(20 80% 38%)", fontWeight: 700 }}>→</span>
      <span style={{
        padding: "2px 7px", borderRadius: 4, fontWeight: 600,
        background: tone.bg, color: tone.fg,
      }}>{D.ACTION_SHORT[row.final_action]}</span>
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Live indicator (used in stats bar)
const LiveIndicatorV2 = ({ heartbeat = "vor 14s", rate = "≈ 1 / 40s" }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "5px 12px 5px 10px",
    border: "1px solid var(--color-border)", borderRadius: 999,
    background: "var(--color-card)",
  }}>
    <span style={{ position: "relative", width: 8, height: 8 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: 999,
        background: "hsl(142 71% 45%)" }}></span>
      <span style={{ position: "absolute", inset: -4, borderRadius: 999,
        background: "hsl(142 71% 45% / 0.3)",
        animation: "pulse 2s ease-out infinite" }}></span>
    </span>
    <span style={{ fontSize: 12, fontWeight: 500 }}>Live</span>
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11,
      color: "var(--color-muted-foreground)" }}>{heartbeat}</span>
    <span style={{ width: 1, height: 12, background: "var(--color-border)" }}></span>
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11,
      color: "var(--color-muted-foreground)" }}>{rate}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────
// Mini horizontal action-distribution bar (used in account cards + sender rail)
const MiniDistBar = ({ actions, height = 4 }) => {
  const D = window.MAIL_DATA;
  const total = D.ACTIONS.reduce((s, a) => s + (actions[a] || 0), 0);
  if (!total) return null;
  return (
    <div style={{ display: "flex", height, borderRadius: 999, overflow: "hidden",
      background: "hsl(214 32% 94%)" }}>
      {D.ACTIONS.map((a) => {
        const n = actions[a] || 0;
        if (!n) return null;
        return <span key={a} title={`${a}: ${n}`}
          style={{ flex: n, background: ACTION_TONES[a].dot }}></span>;
      })}
    </div>
  );
};

// Export to window
Object.assign(window, {
  ACTION_TONES, ACCOUNT_COLORS,
  ConfidencePipV2, TierChip, AccountDot, AccountChip,
  ActionBadgeV2, LiveIndicatorV2, MiniDistBar,
  fmtNum, fmtTime,
});
