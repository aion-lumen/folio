// Folio Mail-Queue · Iter 2 · main composition
// Stateful component. Three artboards pre-configure it differently.

const D = () => window.MAIL_DATA;

// ─────────────────────────────────────────────────────────────────────────
// MailQueueView — root component
// Props:
//   initialAccount   null | "gmail" | "yahoo" | "mirhamed_ch"
//   initialDrawerId  null | rowId  (opens detail panel)
//   showDrawer       bool (force drawer slot visible)
//   compactRail      bool
// ─────────────────────────────────────────────────────────────────────────
const MailQueueView = ({
  initialAccount = null,
  initialDrawerId = null,
  showDrawer = false,
  compactRail = false,
}) => {
  const data = D();
  const [accountFilter, setAccountFilter] = React.useState(initialAccount);
  const [actionFilter, setActionFilter] = React.useState(null);
  const [onlyDisagree, setOnlyDisagree] = React.useState(false);
  const [senderFilter, setSenderFilter] = React.useState(null);
  const [sortBy, setSortBy] = React.useState("time");
  const [selectedId, setSelectedId] = React.useState(initialDrawerId);

  // Filter pipeline
  let rows = data.rows;
  if (accountFilter) rows = rows.filter((r) => r.account === accountFilter);
  if (actionFilter) rows = rows.filter((r) => r.final_action === actionFilter);
  if (onlyDisagree) rows = rows.filter((r) => r.disagreement);
  if (senderFilter) rows = rows.filter((r) => r.from_addr === senderFilter);

  rows = React.useMemo(() => {
    const r = [...rows];
    if (sortBy === "confidence") r.sort((a, b) => a.confidence - b.confidence);
    else if (sortBy === "disagreement") r.sort((a, b) =>
      (b.disagreement ? 1 : 0) - (a.disagreement ? 1 : 0));
    else r.sort((a, b) => (a.received_at < b.received_at ? 1 : -1));
    return r;
  }, [rows, sortBy]);

  // Account-aware stats
  const stats = React.useMemo(() => {
    const base = accountFilter ? data.statsByAccount[accountFilter] : {
      total: data.total, keep: data.counts.keep,
      disagreements: data.disagreements.length, counts: data.counts,
    };
    return base;
  }, [accountFilter, data]);

  const selectedRow = selectedId ? rows.find((r) => r.id === selectedId) || data.rows.find((r) => r.id === selectedId) : null;
  const showDrawerNow = showDrawer || !!selectedId;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "var(--color-background)", minHeight: 0,
    }}>
      <ViewHeader accountFilter={accountFilter}
        stats={stats} scoped={!!accountFilter} />

      <AccountStrip
        accountFilter={accountFilter}
        setAccountFilter={(a) => { setAccountFilter(a); setSenderFilter(null); }}
        stats={stats}
        disagree={{ on: onlyDisagree, set: setOnlyDisagree }}
      />

      <FilterBar
        actionFilter={actionFilter} setActionFilter={setActionFilter}
        scopedStats={stats}
        senderFilter={senderFilter} setSenderFilter={setSenderFilter}
        sortBy={sortBy} setSortBy={setSortBy}
      />

      {/* Main: list + right pane (rail or drawer) */}
      <div style={{ flex: 1, display: "grid",
        gridTemplateColumns: showDrawerNow ? "1fr 440px" : (compactRail ? "1fr 240px" : "1fr 300px"),
        minHeight: 0,
      }}>
        <MailList rows={rows}
          showAccountCol={!accountFilter}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {showDrawerNow
          ? <DetailDrawer row={selectedRow} onClose={() => setSelectedId(null)} />
          : <SenderRail
              accountFilter={accountFilter}
              onSender={setSenderFilter} compact={compactRail} />
        }
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Header strip
const ViewHeader = ({ accountFilter, stats, scoped }) => {
  const data = D();
  const acc = accountFilter ? data.ACCOUNTS.find((a) => a.id === accountFilter) : null;
  const accColor = acc ? window.ACCOUNT_COLORS[acc.id] : null;
  return (
    <header style={{
      padding: "14px 28px 12px", borderBottom: "1px solid var(--color-border)",
      background: "var(--color-card)",
      display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24,
    }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 3 }}>
          Folio · /mail-queue
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em", margin: 0,
          display: "flex", alignItems: "center", gap: 10 }}>
          Mail-Queue
          {acc && (
            <>
              <span style={{ color: "var(--color-muted-foreground)", fontWeight: 400 }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 17, fontWeight: 600, color: accColor.deep,
                background: accColor.soft,
                padding: "2px 10px", borderRadius: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999,
                  background: accColor.dot }}></span>
                {acc.label}
              </span>
            </>
          )}
        </h1>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16,
        fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--color-muted-foreground)" }}>
        <span><span style={{ fontWeight: 600, color: "var(--color-foreground)",
          fontVariantNumeric: "tabular-nums" }}>{window.fmtNum(stats.total)}</span>{" Mails"}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span><span style={{ fontWeight: 600, color: "var(--color-foreground)" }}>
          {data.senders.length}</span>{" Sender"}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span><span style={{ fontWeight: 600, color: "var(--color-foreground)" }}>
          {data.ACCOUNTS.length}</span>{" Accounts"}</span>
      </div>
    </header>
  );
};

// (StatsBarV2 removed in Iter-2 refinement — per-action counts moved to action chips;
// live + disagreement-toggle moved inline into AccountStrip.)

const StatCellV2 = () => null;
const DisagreementCell = () => null;

// ─────────────────────────────────────────────────────────────────────────
// Account Strip — single row: account buttons + inline mini-stats on the right
// (replaces the old account-cards section per Architekt-Feedback Iter 2 Akzent A/B)
const AccountStrip = ({ accountFilter, setAccountFilter, stats, disagree }) => {
  const data = D();
  const keepPct = Math.round((stats.counts.keep / stats.total) * 100);
  return (
    <div style={{
      padding: "12px 28px",
      borderBottom: "1px solid var(--color-border)",
      background: "var(--color-card)",
      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
    }}>
      <span className="eyebrow" style={{ minWidth: 72 }}>Account</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <AccountBtn active={!accountFilter} onClick={() => setAccountFilter(null)}>
          Alle <NumPart>{window.fmtNum(data.total)}</NumPart>
        </AccountBtn>
        {data.ACCOUNTS.map((acc) => (
          <AccountBtn key={acc.id}
            active={accountFilter === acc.id}
            accountId={acc.id}
            onClick={() => setAccountFilter(accountFilter === acc.id ? null : acc.id)}>
            <window.AccountDot accountId={acc.id} size={7} />
            {acc.label}
            <NumPart>{window.fmtNum(data.statsByAccount[acc.id].total)}</NumPart>
          </AccountBtn>
        ))}
      </div>
      <div style={{ flex: 1 }}></div>
      <InlineStats stats={stats} keepPct={keepPct} scoped={!!accountFilter}
        disagree={disagree} />
    </div>
  );
};

// Solid account button — taller (28px) than the Aktion-Chips (24px) below,
// to mark Account-Filter > Aktion-Filter in visual hierarchy.
const AccountBtn = ({ children, active, onClick, accountId }) => {
  const c = accountId ? window.ACCOUNT_COLORS[accountId] : null;
  const bg = active ? (c ? c.dot : "var(--color-primary)") : "var(--color-card)";
  const fg = active ? "white" : "var(--color-foreground)";
  const border = active
    ? (c ? c.dot : "var(--color-primary)")
    : "var(--color-border)";
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 12px 5px 10px", borderRadius: 8,
      fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
      height: 28, lineHeight: 1,
      border: `1px solid ${border}`,
      background: bg, color: fg,
      cursor: "pointer",
      transition: "background 100ms, border-color 100ms",
    }}>{children}</button>
  );
};

const NumPart = ({ children }) => (
  <span style={{
    fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 500,
    opacity: 0.7, marginLeft: 2,
  }}>{children}</span>
);

// Inline mini-stats — secondary information sitting to the right of the
// account selector, reflects the current account scope.
const InlineStats = ({ stats, keepPct, scoped, disagree }) => {
  const disToggleOn = disagree && disagree.on;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14,
      fontSize: 12.5, color: "var(--color-muted-foreground)",
      whiteSpace: "nowrap" }}>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: "var(--color-foreground)", fontWeight: 600,
          fontFamily: "var(--font-mono)" }}>{keepPct}%</span>
        {" "}<span style={{ color: "var(--color-muted-foreground)" }}>keep</span>
      </span>
      <span style={{ width: 3, height: 3, borderRadius: 999,
        background: "var(--color-muted-foreground)", opacity: 0.4 }}></span>
      <button
        onClick={() => disagree && disagree.set(!disToggleOn)}
        style={{
          background: disToggleOn ? "hsl(32 100% 60% / 0.14)" : "transparent",
          border: disToggleOn
            ? "1px solid hsl(32 100% 60% / 0.4)"
            : "1px solid transparent",
          padding: "3px 8px", borderRadius: 999,
          fontVariantNumeric: "tabular-nums",
          display: "inline-flex", alignItems: "center", gap: 6,
          cursor: "pointer", fontSize: 12.5,
          color: "var(--color-muted-foreground)",
        }}>
        <span style={{ width: 6, height: 6, borderRadius: 999,
          background: stats.disagreements > 0 ? "hsl(32 100% 55%)" : "hsl(215 16% 70%)" }}></span>
        <span style={{ color: stats.disagreements > 0 ? "hsl(20 80% 38%)" : "var(--color-foreground)",
          fontWeight: 600, fontFamily: "var(--font-mono)" }}>
          {stats.disagreements}
        </span>
        <span>disagreements{disToggleOn && " · isoliert"}</span>
      </button>
      <span style={{ width: 3, height: 3, borderRadius: 999,
        background: "var(--color-muted-foreground)", opacity: 0.4 }}></span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ position: "relative", width: 7, height: 7 }}>
          <span style={{ position: "absolute", inset: 0, borderRadius: 999,
            background: "hsl(142 71% 45%)" }}></span>
          <span style={{ position: "absolute", inset: -3, borderRadius: 999,
            background: "hsl(142 71% 45% / 0.3)",
            animation: "pulse 2s ease-out infinite" }}></span>
        </span>
        <span>Heartbeat</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-foreground)" }}>
          vor 14s
        </span>
      </span>
      {scoped && (
        <>
          <span style={{ width: 3, height: 3, borderRadius: 999,
            background: "var(--color-muted-foreground)", opacity: 0.4 }}></span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11,
            padding: "1px 6px", borderRadius: 4,
            background: "hsl(214 32% 94%)", color: "hsl(215 20% 40%)" }}>scoped</span>
        </>
      )}
    </div>
  );
};

const ChipBtn = ({ children, active, onClick, accountId }) => {
  const c = accountId ? window.ACCOUNT_COLORS[accountId] : null;
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 11px", borderRadius: 999,
      fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
      border: active
        ? "1px solid var(--color-primary)"
        : "1px solid var(--color-border)",
      background: active ? "var(--color-primary)" : (c ? "var(--color-card)" : "var(--color-card)"),
      color: active ? "var(--color-primary-foreground)" : "var(--color-foreground)",
      cursor: "pointer",
      transition: "background 100ms, border-color 100ms",
    }}>{children}</button>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Filter Bar — action chips + sort
const FilterBar = ({
  actionFilter, setActionFilter, scopedStats,
  senderFilter, setSenderFilter, sortBy, setSortBy,
}) => {
  const data = D();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      padding: "10px 28px", borderBottom: "1px solid var(--color-border)",
      background: "var(--color-card)",
    }}>
      <span className="eyebrow" style={{ minWidth: 72 }}>Aktion</span>
      <ChipBtn active={!actionFilter} onClick={() => setActionFilter(null)}>
        Alle · <span style={{ fontFamily: "var(--font-mono)" }}>
          {window.fmtNum(scopedStats.total)}
        </span>
      </ChipBtn>
      {data.ACTIONS.map((a) => {
        const tone = window.ACTION_TONES[a];
        const active = actionFilter === a;
        return (
          <button key={a}
            onClick={() => setActionFilter(active ? null : a)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 11px", borderRadius: 999,
              fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
              border: active
                ? `1px solid ${tone.dot}`
                : "1px solid var(--color-border)",
              background: active ? tone.bg : "var(--color-card)",
              color: active ? tone.fg : "var(--color-foreground)",
              cursor: "pointer",
            }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: tone.dot }}></span>
            {data.ACTION_LABELS[a].replace(/^→ /, "")} · <span style={{ fontFamily: "var(--font-mono)" }}>
              {window.fmtNum(scopedStats.counts[a])}
            </span>
          </button>
        );
      })}
      {senderFilter && (
        <ChipBtn active={true} onClick={() => setSenderFilter(null)}>
          <span style={{ fontFamily: "var(--font-mono)" }}>{senderFilter}</span> ✕
        </ChipBtn>
      )}
      <div style={{ flex: 1 }}></div>
      <span style={{ fontSize: 11, color: "var(--color-muted-foreground)" }}>Sortierung</span>
      <SortBtnV2 active={sortBy === "time"} onClick={() => setSortBy("time")}>Zeit ↓</SortBtnV2>
      <SortBtnV2 active={sortBy === "confidence"} onClick={() => setSortBy("confidence")}>Konfidenz ↑</SortBtnV2>
      <SortBtnV2 active={sortBy === "disagreement"} onClick={() => setSortBy("disagreement")}>≠ zuerst</SortBtnV2>
    </div>
  );
};

const SortBtnV2 = ({ children, active, onClick }) => (
  <button onClick={onClick} style={{
    fontSize: 11, padding: "4px 9px", borderRadius: 6,
    border: "1px solid " + (active ? "var(--color-foreground)" : "var(--color-border)"),
    background: active ? "var(--color-foreground)" : "transparent",
    color: active ? "var(--color-primary-foreground)" : "var(--color-foreground)",
    cursor: "pointer", fontWeight: 500,
  }}>{children}</button>
);

window.MailQueueView = MailQueueView;
