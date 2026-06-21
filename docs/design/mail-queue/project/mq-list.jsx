// Folio Mail-Queue · Iter 2 · list + sender rail + detail drawer
// Virtualized list for ~4000-row smooth scroll.

const ROW_HEIGHT = 56; // px

// ─────────────────────────────────────────────────────────────────────────
// Virtualized list
const MailList = ({ rows, showAccountCol, selectedId, onSelect }) => {
  const scrollRef = React.useRef(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportH, setViewportH] = React.useState(800);

  React.useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    setViewportH(el.clientHeight);
    const handle = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", handle, { passive: true });
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    return () => { el.removeEventListener("scroll", handle); ro.disconnect(); };
  }, []);

  const overscan = 6;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
  const endIdx = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + overscan);
  const visible = rows.slice(startIdx, endIdx);
  const topPad = startIdx * ROW_HEIGHT;
  const bottomPad = (rows.length - endIdx) * ROW_HEIGHT;

  // grid template (sticky column widths)
  const gridCols = showAccountCol
    ? "100px 56px 240px 1fr 200px 78px 64px"
    : "100px 240px 1fr 200px 78px 64px";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0,
      background: "var(--color-background)",
      borderRight: "1px solid var(--color-border)" }}>
      <ListHeader gridCols={gridCols} showAccountCol={showAccountCol} />
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ paddingTop: topPad, paddingBottom: bottomPad,
            position: "relative" }}>
            {visible.map((r, i) => (
              <ListRowV2 key={r.id} row={r}
                gridCols={gridCols}
                showAccountCol={showAccountCol}
                index={startIdx + i}
                selected={r.id === selectedId}
                onClick={() => onSelect(r.id === selectedId ? null : r.id)}
              />
            ))}
          </div>
        )}
        <FooterTag count={rows.length} />
      </div>
    </div>
  );
};

const ListHeader = ({ gridCols, showAccountCol }) => (
  <div style={{
    display: "grid", gridTemplateColumns: gridCols, gap: 14,
    padding: "10px 28px", alignItems: "center",
    borderBottom: "1px solid var(--color-border)",
    background: "hsl(210 40% 98.5%)",
    position: "sticky", top: 0, zIndex: 2,
    fontSize: 10.5, letterSpacing: "0.06em",
    textTransform: "uppercase", color: "var(--color-muted-foreground)",
    fontWeight: 500,
  }}>
    <span>Empfangen</span>
    {showAccountCol && <span>Acct</span>}
    <span>Sender</span>
    <span>Betreff</span>
    <span>Aktion</span>
    <span style={{ textAlign: "right" }}>Konfidenz</span>
    <span>Tier</span>
  </div>
);

const ListRowV2 = ({ row, gridCols, showAccountCol, index, selected, onClick }) => {
  const dis = row.disagreement;
  const accColor = window.ACCOUNT_COLORS[row.account];

  return (
    <div onClick={onClick} style={{
      display: "grid", gridTemplateColumns: gridCols, gap: 14,
      padding: "0 28px",
      height: ROW_HEIGHT,
      alignItems: "center",
      borderBottom: "1px solid hsl(214 32% 95%)",
      borderLeft: selected
        ? "3px solid var(--color-primary)"
        : dis
          ? "3px solid hsl(32 100% 55%)"
          : "3px solid transparent",
      background: selected ? "hsl(210 40% 97%)" :
        index % 2 === 0 ? "var(--color-card)" : "hsl(210 40% 99.2%)",
      cursor: "pointer",
      transition: "background 80ms",
    }}>
      {/* Time */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5,
          color: "var(--color-foreground)", fontVariantNumeric: "tabular-nums" }}>
          {window.fmtTime(row.received_at, { short: true })}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10,
          color: "var(--color-muted-foreground)", fontVariantNumeric: "tabular-nums" }}>
          {new Date(row.received_at).getFullYear()}
        </span>
      </div>

      {/* Account column */}
      {showAccountCol && (
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <span title={row.account} style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 22, borderRadius: 4,
            background: accColor.soft,
            color: accColor.deep,
            fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: 999,
              background: accColor.dot, marginRight: 4 }}></span>
            {row.account === "mirhamed_ch" ? "m.ch" : row.account.slice(0, 5)}
          </span>
        </div>
      )}

      {/* Sender */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.25,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.from_name}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5,
          color: "var(--color-muted-foreground)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.from_addr}
        </div>
      </div>

      {/* Subject */}
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontSize: 13, fontWeight: dis ? 600 : 500, lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{row.subject}</span>
        {dis && (
          <span title="Disagreement" style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 18, height: 18, borderRadius: 999,
            background: "hsl(32 100% 60% / 0.18)",
            color: "hsl(20 80% 38%)",
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>≠</span>
        )}
      </div>

      {/* Action */}
      <div><window.ActionBadgeV2 row={row} /></div>

      {/* Confidence */}
      <div style={{ textAlign: "right" }}>
        <window.ConfidencePipV2 value={row.confidence} />
      </div>

      {/* Tier */}
      <div><window.TierChip tier={row.tier} /></div>
    </div>
  );
};

const EmptyState = () => (
  <div style={{ padding: 64, textAlign: "center",
    color: "var(--color-muted-foreground)", fontSize: 13 }}>
    Keine Mails entsprechen den Filtern.
  </div>
);

const FooterTag = ({ count }) => (
  <div style={{ padding: "12px 28px 16px",
    fontFamily: "var(--font-mono)", fontSize: 11,
    color: "var(--color-muted-foreground)" }}>
    {window.fmtNum(count)} Zeile{count === 1 ? "" : "n"} · Ende
  </div>
);

// ─────────────────────────────────────────────────────────────────────────
// Sender Rail
const SenderRail = ({ accountFilter, onSender, compact }) => {
  const data = D();
  // account-scoped sender list
  const senders = React.useMemo(() => {
    if (!accountFilter) return data.senders.slice(0, 14);
    const map = new Map();
    data.rows.filter((r) => r.account === accountFilter).forEach((r) => {
      const e = map.get(r.from_addr) || {
        from_addr: r.from_addr, from_name: r.from_name, count: 0,
        actions: { keep: 0, move_immo_portal: 0, move_immo_privat: 0,
                   move_paketzustellung: 0, move_zu_pruefen: 0 },
        disagreements: 0, byAccount: { [accountFilter]: 0 },
      };
      e.count++;
      e.actions[r.final_action]++;
      if (r.disagreement) e.disagreements++;
      e.byAccount[accountFilter]++;
      map.set(r.from_addr, e);
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 14);
  }, [accountFilter, data]);

  return (
    <aside style={{
      padding: compact ? "14px 12px 24px" : "16px 16px 24px",
      display: "flex", flexDirection: "column", gap: 16,
      background: "var(--color-card)",
      overflowY: "auto",
    }}>
      {/* Worker card */}
      <section style={{
        border: "1px solid var(--color-border)", borderRadius: 10, padding: 14,
        background: "var(--color-card)",
      }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Worker</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 12px",
          fontSize: 12 }}>
          <span style={{ color: "var(--color-muted-foreground)" }}>Status</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999,
              background: "hsl(142 71% 45%)" }}></span>
            aktiv
          </span>
          <span style={{ color: "var(--color-muted-foreground)" }}>SSE</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>connected</span>
          <span style={{ color: "var(--color-muted-foreground)" }}>Heartbeat</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>vor 14s</span>
          <span style={{ color: "var(--color-muted-foreground)" }}>Rate</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>≈ 1 / 40s</span>
          <span style={{ color: "var(--color-muted-foreground)" }}>Plugin-Queue</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>3 wartend</span>
        </div>
      </section>

      {/* Top sender */}
      <section>
        <div style={{ display: "flex", alignItems: "baseline",
          justifyContent: "space-between", marginBottom: 8 }}>
          <span className="eyebrow">Top-Sender{accountFilter ? " · " + accountFilter : ""}</span>
          <span style={{ fontSize: 10.5, color: "var(--color-muted-foreground)",
            fontFamily: "var(--font-mono)" }}>
            {senders.length}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {senders.map((s) => (
            <SenderRow key={s.from_addr} s={s}
              showAccountSplit={!accountFilter}
              onClick={() => onSender(s.from_addr)} />
          ))}
        </div>
      </section>
    </aside>
  );
};

const SenderRow = ({ s, showAccountSplit, onClick }) => {
  const accountKeys = Object.keys(s.byAccount || {});
  const multi = accountKeys.length > 1;
  return (
    <button onClick={onClick} style={{
      display: "grid", gridTemplateColumns: "1fr 28px",
      gap: 6, padding: "6px 8px", borderRadius: 6,
      border: "1px solid transparent", background: "transparent",
      cursor: "pointer", textAlign: "left",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.25,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.from_name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5,
          fontFamily: "var(--font-mono)", fontSize: 10,
          color: "var(--color-muted-foreground)" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, minWidth: 0 }}>{s.from_addr}</span>
          {showAccountSplit && multi && (
            <span style={{ display: "inline-flex", gap: 2 }}>
              {accountKeys.map((k) => (
                <span key={k} title={`${k}: ${s.byAccount[k]}`}
                  style={{ width: 5, height: 5, borderRadius: 999,
                    background: window.ACCOUNT_COLORS[k].dot }}></span>
              ))}
            </span>
          )}
        </div>
        <div style={{ marginTop: 4 }}>
          <window.MiniDistBar actions={s.actions} height={3} />
        </div>
      </div>
      <div style={{ textAlign: "right", display: "flex", flexDirection: "column",
        alignItems: "flex-end", justifyContent: "center" }}>
        <span style={{
          fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums",
          color: s.disagreements > 0 ? "hsl(20 80% 38%)" : "var(--color-foreground)" }}>
          {s.count}
        </span>
        {s.disagreements > 0 && (
          <span style={{ fontSize: 9.5, color: "hsl(20 80% 38%)", fontWeight: 600,
            fontFamily: "var(--font-mono)" }}>≠{s.disagreements}</span>
        )}
      </div>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Detail Drawer
const DetailDrawer = ({ row, onClose }) => {
  if (!row) {
    return (
      <aside style={{
        background: "var(--color-card)", padding: 48,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--color-muted-foreground)", fontSize: 13,
        borderLeft: "1px solid var(--color-border)",
      }}>
        Wähle eine Mail, um Details zu sehen
      </aside>
    );
  }
  const data = D();
  const dis = row.disagreement;
  const acc = data.ACCOUNTS.find((a) => a.id === row.account);
  const accColor = window.ACCOUNT_COLORS[row.account];

  return (
    <aside style={{
      background: "var(--color-card)",
      borderLeft: "1px solid var(--color-border)",
      display: "flex", flexDirection: "column", minHeight: 0,
      boxShadow: "-12px 0 24px -16px rgba(0,0,0,0.08)",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px 14px",
        borderBottom: "1px solid var(--color-border)",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <window.AccountChip accountId={row.account} label={acc.label} />
            <window.TierChip tier={row.tier} />
            {dis && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                padding: "1px 6px", borderRadius: 4,
                background: "hsl(32 100% 60% / 0.16)", color: "hsl(20 80% 38%)",
              }}>≠ DISAGREEMENT</span>
            )}
          </div>
          <button onClick={onClose} style={{
            width: 24, height: 24, borderRadius: 6,
            border: "1px solid var(--color-border)", background: "var(--color-card)",
            cursor: "pointer", fontSize: 14, color: "var(--color-muted-foreground)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5,
            color: "var(--color-muted-foreground)", marginBottom: 3 }}>
            {row.from_addr}
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, margin: 0,
            letterSpacing: "-0.005em" }}>
            {row.subject}
          </h2>
          <div style={{ display: "flex", gap: 12, marginTop: 6,
            fontSize: 11, color: "var(--color-muted-foreground)",
            fontFamily: "var(--font-mono)" }}>
            <span>{window.fmtTime(row.received_at)}</span>
            <span>·</span>
            <span style={{ fontFamily: "inherit" }}>{row.from_name}</span>
          </div>
        </div>
      </div>

      {/* Decision pane */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)",
        display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="eyebrow">Klassifikation</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10,
          alignItems: "stretch",
          padding: 10,
          background: dis ? "hsl(32 100% 60% / 0.06)" : "hsl(210 40% 98%)",
          border: dis ? "1px solid hsl(32 100% 60% / 0.25)" : "1px solid var(--color-border)",
          borderRadius: 8,
        }}>
          <DecisionSide
            label="Heuristik"
            action={row.suggested_action}
            sub={`Konfidenz ${Math.round(row.confidence * 100)}%`}
            fade={dis}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
            color: dis ? "hsl(20 80% 38%)" : "var(--color-muted-foreground)",
            fontSize: 16, fontWeight: 700 }}>→</div>
          <DecisionSide
            label="User"
            action={row.final_action}
            sub={row.confirmed ? "bestätigt" : `Entscheid in ${(row.response_ms / 1000).toFixed(1)}s`}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6,
          fontSize: 12, lineHeight: 1.55 }}>
          <div>
            <span className="eyebrow" style={{ display: "inline-block", minWidth: 64 }}>Evidence</span>
            <span style={{ color: "var(--color-foreground)" }}>{row.evidence}</span>
          </div>
          <div>
            <span className="eyebrow" style={{ display: "inline-block", minWidth: 64 }}>Reason</span>
            <span style={{ color: "var(--color-foreground)" }}>{row.reason}</span>
          </div>
          <div>
            <span className="eyebrow" style={{ display: "inline-block", minWidth: 64 }}>Markers</span>
            <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
              {row.markers.map((m) => (
                <span key={m} style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  padding: "1px 6px", borderRadius: 4,
                  background: "var(--color-muted)", color: "var(--color-muted-foreground)",
                }}>{m}</span>
              ))}
            </span>
          </div>
        </div>
      </div>

      {/* Body preview placeholder */}
      <div style={{ padding: "16px 20px", flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Body · Preview (lazy)</div>
        <div style={{
          border: "1px dashed var(--color-border)", borderRadius: 8,
          padding: "20px 18px", display: "flex", flexDirection: "column", gap: 8,
          color: "var(--color-muted-foreground)", fontSize: 12,
          background: "hsl(210 40% 99%)",
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6,
            fontWeight: 500, color: "var(--color-foreground)", fontSize: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999,
              background: "hsl(215 20% 55%)" }}></span>
            Body wird bei Bedarf nachgeladen (Phase 2)
          </span>
          <span>SHA-256: <span style={{ fontFamily: "var(--font-mono)" }}>
            {row.id.replace("m_", "")}…body…hash</span></span>
          <span>Message-ID: <span style={{ fontFamily: "var(--font-mono)" }}>
            {row.id}@folio.local</span></span>
        </div>
      </div>

      {/* Footer actions — Phase-2 placeholders */}
      <div style={{ padding: "12px 20px",
        borderTop: "1px solid var(--color-border)",
        display: "flex", gap: 8, justifyContent: "flex-end",
        background: "hsl(210 40% 99%)" }}>
        <button style={{
          fontSize: 12, padding: "6px 12px", borderRadius: 6,
          border: "1px solid var(--color-border)", background: "var(--color-card)",
          color: "var(--color-muted-foreground)", cursor: "not-allowed",
          fontWeight: 500,
        }} disabled>Re-classify (Phase 2)</button>
        <button style={{
          fontSize: 12, padding: "6px 12px", borderRadius: 6,
          border: "1px solid var(--color-border)", background: "var(--color-card)",
          color: "var(--color-muted-foreground)", cursor: "not-allowed",
          fontWeight: 500,
        }} disabled>Mail öffnen</button>
      </div>
    </aside>
  );
};

const DecisionSide = ({ label, action, sub, fade }) => {
  const data = D();
  const tone = window.ACTION_TONES[action];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0,
      opacity: fade ? 0.62 : 1 }}>
      <span className="eyebrow" style={{ fontSize: 10 }}>{label}</span>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 8px 3px 6px", borderRadius: 6,
        background: tone.bg, color: tone.fg,
        fontSize: 12, fontWeight: 600, alignSelf: "flex-start",
        textDecoration: fade ? "line-through" : "none",
      }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: tone.dot }}></span>
        {data.ACTION_LABELS[action]}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5,
        color: "var(--color-muted-foreground)" }}>{sub}</span>
    </div>
  );
};

Object.assign(window, { MailList, SenderRail, DetailDrawer });
