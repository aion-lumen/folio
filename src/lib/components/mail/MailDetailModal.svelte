<script lang="ts">
	let { onClose }: { onClose: () => void } = $props();

	// Svelte-action für Portal: bewegt das Element zu document.body damit es nicht
	// in einem parent stacking-context (Header.topbar z-20) gefangen wird.
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	interface MailStatus {
		badge: 'green' | 'amber' | 'red' | null;
		fallback?: boolean;
		chipText?: string;
		conn?: { nm: string; sub: string; dot?: string };
		last?: { nm: string; sub: string; dot: string };
		today?: { nm: string; sub: string };
		error?: { code: string; t: string; msg: string; fix: string; cmd: string; post: string } | null;
		perAccount?: { name: string; hoursAgo: number }[];
	}

	interface AccountInfo {
		name: string;
		displayName: string;
		host: string;
	}

	interface MailEntry {
		t: string;
		fr: string;
		subj: string;
		out: 'ok' | 'skip' | 'herm' | 'fail';
		res: string;
	}

	interface StreamLine {
		c: 'info' | 'ok' | 'warn' | 'err';
		t?: string;
		x: string;
	}

	let status = $state<MailStatus | null>(null);
	let recent = $state<MailEntry[]>([]);
	let accounts = $state<AccountInfo[]>([]);
	let selectedAccount = $state('');
	let running = $state(false);
	let streamLines = $state<StreamLine[]>([]);
	let done = $state(false);
	let eventSource = $state<EventSource | null>(null);

	// Bug-fix 2026-05-25: list aktualisiert sich beim Modal-Open initial PLUS
	// periodic alle 30s while open. Plus manueller Refresh-Button (siehe template).
	// Refresh-feedback: short "refreshedAt" tick triggert UI-opacity-pulse damit
	// User sieht dass click ankam (auch wenn Daten identisch sind).
	let isRefreshing = $state(false);
	let lastRefreshAt = $state<number>(0);

	async function loadAll(): Promise<void> {
		isRefreshing = true;
		try {
			// Cache-busting query-param damit Browser keine 304-cached response zurückgibt
			const ts = Date.now();
			// Bug-fix 2026-05-25: 'recent'-Liste kommt jetzt aus feedback.db (Worker-Imports)
			// statt aus dem Vault-Filesystem (legacy life-mail markdown-notes). Worker
			// schreibt in feedback.db — Modal soll diese frischen Imports zeigen.
			const [s, r, a] = (await Promise.all([
				fetch(`/api/vault/mail/status?_=${ts}`).then((res) => res.json()),
				fetch(`/api/mail/recent-imports?limit=10&_=${ts}`).then((res) => res.json()),
				fetch('/api/life-mail/accounts').then((res) => res.json())
			])) as [MailStatus, MailEntry[], { accounts: AccountInfo[] }];
			status = s;
			recent = Array.isArray(r) ? r : [];
			if (accounts.length === 0) {
				accounts = a.accounts ?? [];
				// Default-Account nur initial setzen (sonst springt User-Selection zurück)
				if (accounts.length > 0 && !selectedAccount) {
					const perAccount = s.perAccount ?? [];
					const mostIdle = [...accounts].sort((x, y) => {
						const hx = perAccount.find((p) => p.name === x.name)?.hoursAgo ?? Infinity;
						const hy = perAccount.find((p) => p.name === y.name)?.hoursAgo ?? Infinity;
						return hy - hx;
					})[0];
					selectedAccount = mostIdle?.name ?? accounts[0].name;
				}
			}
			lastRefreshAt = Date.now();
		} catch (err) {
			console.warn('[MailDetailModal] loadAll failed:', err);
		} finally {
			isRefreshing = false;
		}
	}

	$effect(() => {
		void loadAll();
		// Periodic refresh while modal is mounted (open). Stops on cleanup.
		const interval = setInterval(() => { void loadAll(); }, 30_000);
		return () => {
			eventSource?.close();
			clearInterval(interval);
		};
	});

	function startRun() {
		if (running) return;
		running = true;
		streamLines = [];
		done = false;

		const account = selectedAccount || accounts[0]?.name;
		const runUrl = account ? `/api/life-mail/run?account=${encodeURIComponent(account)}` : '/api/life-mail/run';

		fetch(runUrl, { method: 'POST' }).then(async (res) => {
			if (!res.ok) {
				const msg = await res.text();
				streamLines = [...streamLines, { c: 'err', x: msg }];
				running = false;
				return;
			}
			const reader = res.body?.getReader();
			if (!reader) { running = false; return; }

			const decoder = new TextDecoder();
			let buf = '';

			while (true) {
				const { done: d, value } = await reader.read();
				if (d) break;
				buf += decoder.decode(value, { stream: true });
				const parts = buf.split('\n\n');
				buf = parts.pop() ?? '';
				for (const part of parts) {
					const line = part.replace(/^data: /, '').trim();
					if (!line) continue;
					if (line === '[DONE]') {
						running = false;
						done = true;
						reader.cancel();
						return;
					}
					try {
						const parsed = JSON.parse(line) as StreamLine;
						streamLines = [...streamLines, parsed];
					} catch {
						streamLines = [...streamLines, { c: 'info', x: line }];
					}
				}
			}
			running = false;
			done = true;
		}).catch((err: Error) => {
			streamLines = [...streamLines, { c: 'err', x: err.message }];
			running = false;
		});
	}

	function cancelRun() {
		eventSource?.close();
		eventSource = null;
		running = false;
		streamLines = [...streamLines, { c: 'warn', x: '✗ Abgebrochen durch Nutzer' }];
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Portal-Action: Modal-Backdrop wird zu document.body verschoben — verhindert
     dass parent stacking-contexts (z.B. Header.topbar mit position:relative + z-20)
     das fixed-positioned modal überdecken. (Bug-fix 2026-05-25 nach z-index 9999
     alone nicht reichte.) -->
<div use:portal class="mm-backdrop" role="button" tabindex="-1" aria-label="Modal schließen" onclick={onClose} onkeydown={(e) => e.key === 'Enter' && onClose()}>
	<div class="mm" role="dialog" aria-modal="true" aria-label="Mail-Integration" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>

		{#if !status}
			<!-- Loading -->
			<div class="mm-hd">
				<div class="mm-ico">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
					</svg>
				</div>
				<div class="mm-t">
					<div class="mm-crumb">life-mail · integration</div>
					<h2>Mail-Integration</h2>
				</div>
				<button class="mm-close" onclick={onClose}>×</button>
			</div>
			<div class="mm-body">
				<div class="mm-loading">Lade…</div>
			</div>

		{:else if status.fallback}
			<!-- Fallback: not configured -->
			<div class="mm-hd">
				<div class="mm-ico">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
					</svg>
				</div>
				<div class="mm-t">
					<div class="mm-crumb">life-mail · integration</div>
					<h2>Mail-Integration</h2>
					<div class="chips"><span class="mm-chip">nicht aktiv</span></div>
				</div>
				<button class="mm-close" onclick={onClose}>×</button>
			</div>
			<div class="mm-body">
				<div class="mm-fallback">
					<div class="hero-ico">
						<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
							<rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
						</svg>
					</div>
					<h3>Mail-Integration nicht aktiv</h3>
					<p>
						<code>_meta/mail/state.json</code> existiert nicht im Vault.<br />
						life-mail ist ein optionales Power-Feature, das eingehende Mails lokal klassifiziert
						und automatisch zu Tasks oder Hermes-Eskalationen verknüpft — ohne dass Daten den Rechner verlassen.
					</p>
					<div class="f-actions">
						<button class="mm-btn ghost" onclick={onClose}>Schließen</button>
					</div>
				</div>
			</div>
			<div class="mm-foot">
				<span>life-mail · nicht konfiguriert</span>
				<div class="kbds"><span class="kbd">esc</span><span>schließen</span></div>
			</div>

		{:else}
			{@const headClass = status.error ? 'red' : status.badge === 'amber' ? 'amber' : 'green'}
			{@const chipClass = status.error ? 'red' : status.badge === 'amber' ? 'amber' : 'green'}
			{@const chipText = status.chipText ?? (status.error ? 'fehlgeschlagen' : status.badge === 'amber' ? 'stillstand · >12 std.' : 'aktiv · läuft')}

			<div class="mm-hd {headClass}">
				<div class="mm-ico">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
					</svg>
				</div>
				<div class="mm-t">
					<div class="mm-crumb">life-mail · integration</div>
					<h2>Mail-Integration</h2>
					<div class="chips">
						<span class="mm-chip {chipClass}"><span class="d"></span>{chipText}</span>
						<span class="mm-chip">gemma · lokal</span>
					</div>
				</div>
				<button class="mm-close" onclick={onClose}>×</button>
			</div>

			<div class="mm-body">

				<!-- Status cards -->
				<div>
					<div class="mm-sec-head">Status</div>
					<div class="mm-status-grid">
						<div class="mm-stat-card">
							<div class="k">Connector</div>
							<div class="v">
								<span class="d {status.conn?.dot ?? status.badge}"></span>
								{status.conn?.nm ?? '—'}
							</div>
							<div class="sub">{status.conn?.sub ?? ''}</div>
						</div>
						<div class="mm-stat-card">
							<div class="k">Letzter Lauf</div>
							<div class="v">
								<span class="d {status.last?.dot}"></span>
								{status.last?.nm ?? '—'}
							</div>
							<div class="sub">{status.last?.sub ?? ''}</div>
						</div>
						<div class="mm-stat-card">
							<div class="k">Heute verarbeitet</div>
							<div class="v">{status.today?.nm ?? '—'}</div>
							<div class="sub">{status.today?.sub ?? ''}</div>
						</div>
					</div>
				</div>

				<!-- Error panel -->
				{#if status.error}
					<div>
						<div class="mm-sec-head">Fehler</div>
						<div class="mm-err">
							<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="10" />
								<line x1="12" y1="8" x2="12" y2="12" />
								<line x1="12" y1="16" x2="12.01" y2="16" />
							</svg>
							<div class="e-body">
								<div class="e-t">{status.error.msg}</div>
								<div class="e-sub">
									{status.error.fix} <code>{status.error.cmd}</code>{status.error.post}
								</div>
								<div class="e-time">{status.error.code} · {status.error.t}</div>
							</div>
						</div>
					</div>
				{/if}

				<!-- Pipeline action -->
				<div>
					<div class="mm-sec-head">Pipeline</div>
					<div class="mm-pipe" class:running>
						{#if accounts.length > 0}
							<div class="mm-account-row">
								<label class="mm-acc-label" for="mm-account-sel">Account</label>
								<select
									id="mm-account-sel"
									class="mm-acc-select"
									bind:value={selectedAccount}
									disabled={running}
								>
									{#each accounts as acc}
										<option value={acc.name}>{acc.displayName}</option>
									{/each}
								</select>
							</div>
						{/if}
						<div class="mm-pipe-row">
							<div class="mm-pipe-txt">
								<div class="t">{running ? 'Lauf aktiv …' : done ? 'Lauf abgeschlossen' : 'Jetzt prüfen'}</div>
								<div class="sub">{running ? 'streamt stdout · Esc bricht ab' : 'ruft life-mail pipeline einmalig auf'}</div>
							</div>
							{#if running}
								<button class="mm-btn ghost" onclick={cancelRun}>Abbrechen</button>
							{:else}
								<button class="mm-btn" onclick={startRun}>
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polygon points="5 3 19 12 5 21 5 3" />
									</svg>
									{done ? 'Erneut prüfen' : 'Jetzt prüfen'}
								</button>
							{/if}
						</div>
						{#if running || streamLines.length > 0}
							<div class="mm-stream">
								{#each streamLines as line}
									<span class="line {line.c}">
										{#if line.t}<span class="ts">{line.t}</span>{/if}{line.x}
									</span>
								{/each}
								{#if running}<span class="line cursor"></span>{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Recent mails — 2026-05-25 mit Refresh-Button + Link zu Mail-Queue gefiltert auf recent imported -->
				<div class:mm-refreshing={isRefreshing}>
					<div class="mm-sec-head">
						<span>Letzte Worker-Imports <span class="mm-count">{recent.length}</span></span>
						<span class="mm-refresh-group">
							{#if lastRefreshAt > 0 && !isRefreshing}
								<span class="mm-refresh-ts" title="Zuletzt aktualisiert">
									{new Date(lastRefreshAt).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
								</span>
							{/if}
							<button
								type="button"
								class="mm-refresh-btn"
								onclick={() => void loadAll()}
								disabled={isRefreshing}
								title="Liste neu laden"
							>
								{isRefreshing ? '…' : '↻'}
							</button>
						</span>
					</div>
					{#if recent.length === 0}
						<div class="mm-empty">Keine Mail-Einträge im Vault gefunden.</div>
					{:else}
						<div class="mm-recent">
							{#each recent as m}
								<!-- Klick → Mail-Queue mit recent-Filter (letzte 1h) + Modal close -->
								<a
									class="mm-mail mm-mail-link"
									href="/mail-queue?recent=1"
									onclick={onClose}
								>
									<span class="dot {m.out}"></span>
									<div class="cen">
										<div class="l1">{m.subj}</div>
										<div class="l2">
											<span class="fr">{m.fr}</span>
											<span class="out {m.out}">· {m.res}</span>
										</div>
									</div>
									<span class="ts2">{m.t}</span>
								</a>
							{/each}
						</div>
						<a
							class="mm-recent-jump"
							href="/mail-queue?recent=1"
							onclick={onClose}
						>
							Alle in Mail-Queue (letzte 1h) öffnen →
						</a>
					{/if}
				</div>

			</div>

			<div class="mm-foot">
				<span>_meta/mail/state.json · zuletzt {status.last?.sub ?? '—'}</span>
				<div class="kbds"><span class="kbd">esc</span><span>schließen</span></div>
			</div>
		{/if}

	</div>
</div>

<style>
	.mm-backdrop {
		position: fixed;
		inset: 0;
		background: hsl(222 47% 6% / 0.45);
		backdrop-filter: blur(3px);
		/* Bug-fix 2026-05-25: z-index 9999 schlägt jeden anderen Layer (vorher z=900
		   wurde teilweise von MailToolbar.sticky z-20 in bestimmten stacking-contexts
		   überdeckt). isolation:isolate forciert eigenen stacking-context-root. */
		z-index: 9999;
		isolation: isolate;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 40px 24px;
		animation: mm-fade 180ms ease;
	}
	@keyframes mm-fade {
		from { opacity: 0; }
		to   { opacity: 1; }
	}

	.mm {
		width: 100%;
		max-width: 720px;
		max-height: calc(100vh - 80px);
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 14px;
		box-shadow: 0 24px 64px rgb(0 0 0 / 0.18);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: mm-rise 220ms cubic-bezier(0.4, 0, 0.2, 1);
	}
	@keyframes mm-rise {
		from { opacity: 0; transform: translateY(8px) scale(0.985); }
		to   { opacity: 1; transform: translateY(0) scale(1); }
	}

	/* Header */
	.mm-hd {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 18px 14px;
		border-bottom: 1px solid var(--color-border);
	}
	.mm-ico {
		width: 36px;
		height: 36px;
		border-radius: 9px;
		background: var(--color-muted);
		color: var(--color-muted-foreground);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.mm-hd.green .mm-ico { background: hsl(142 76% 94%); color: hsl(142 72% 29%); }
	.mm-hd.amber .mm-ico { background: hsl(32 100% 93%); color: hsl(25 95% 38%); }
	.mm-hd.red   .mm-ico { background: hsl(0 86% 94%);   color: hsl(0 74% 42%);  }

	.mm-t { flex: 1; min-width: 0; }
	.mm-crumb {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--color-muted-foreground);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-bottom: 2px;
	}
	.mm-hd h2 {
		font-size: 17px;
		font-weight: 600;
		color: var(--color-foreground);
		letter-spacing: -0.01em;
		margin: 0 0 6px;
		line-height: 1.2;
	}
	.chips { display: flex; gap: 6px; flex-wrap: wrap; }
	.mm-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 10px;
		background: var(--color-muted);
		color: var(--color-muted-foreground);
		font-weight: 500;
	}
	.mm-chip .d { width: 6px; height: 6px; border-radius: 50%; background: hsl(142 71% 45%); }
	.mm-chip.green { background: hsl(142 76% 94%); color: hsl(142 72% 29%); }
	.mm-chip.green .d { background: hsl(142 71% 45%); }
	.mm-chip.amber { background: hsl(32 100% 93%); color: hsl(25 95% 38%); }
	.mm-chip.amber .d { background: hsl(32 100% 55%); }
	.mm-chip.red   { background: hsl(0 86% 94%);   color: hsl(0 74% 42%);  }
	.mm-chip.red .d   { background: hsl(0 74% 55%); }

	.mm-close {
		background: none;
		border: none;
		font-size: 22px;
		color: var(--color-muted-foreground);
		cursor: pointer;
		padding: 4px 10px;
		border-radius: 6px;
		line-height: 1;
		flex-shrink: 0;
		align-self: flex-start;
	}
	.mm-close:hover { background: var(--color-muted); color: var(--color-foreground); }

	/* Body */
	.mm-body {
		flex: 1;
		overflow-y: auto;
		padding: 16px 18px 18px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.mm-loading {
		color: var(--color-muted-foreground);
		font-size: 13px;
		padding: 24px 0;
		text-align: center;
	}

	/* Section head */
	.mm-sec-head {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		font-weight: 600;
		color: var(--color-muted-foreground);
		margin-bottom: 8px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.mm-refresh-group {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.mm-refresh-ts {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--color-muted-foreground);
		opacity: 0.7;
	}
	.mm-refreshing {
		opacity: 0.55;
		transition: opacity 120ms ease;
	}
	.mm-refresh-btn {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		color: var(--color-muted-foreground);
		font-size: 12px;
		line-height: 1;
		padding: 2px 6px;
		cursor: pointer;
		transition: background 120ms, color 120ms;
	}
	.mm-refresh-btn:hover:not(:disabled) {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.mm-refresh-btn:disabled { opacity: 0.5; cursor: wait; }
	.mm-mail-link {
		text-decoration: none;
		color: inherit;
		display: flex;
	}
	.mm-recent-jump {
		display: block;
		margin-top: 8px;
		padding: 6px 10px;
		font-size: 11px;
		color: var(--color-muted-foreground);
		text-decoration: none;
		border: 1px dashed var(--color-border);
		border-radius: 6px;
		text-align: center;
		transition: background 120ms, color 120ms;
	}
	.mm-recent-jump:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.mm-count {
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.04em;
		color: var(--color-muted-foreground);
		background: var(--color-muted);
		padding: 1px 6px;
		border-radius: 10px;
		text-transform: none;
		font-weight: 500;
	}

	/* Status cards */
	.mm-status-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}
	.mm-stat-card {
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-height: 70px;
	}
	.mm-stat-card .k {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		font-weight: 600;
		color: var(--color-muted-foreground);
	}
	.mm-stat-card .v {
		font-size: 14px;
		font-weight: 600;
		color: var(--color-foreground);
		letter-spacing: -0.01em;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.mm-stat-card .sub {
		font-size: 11px;
		color: var(--color-muted-foreground);
		margin-top: auto;
	}
	.mm-stat-card .v .d {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.mm-stat-card .v .d.green { background: hsl(142 71% 45%); }
	.mm-stat-card .v .d.amber { background: hsl(32 100% 55%); }
	.mm-stat-card .v .d.red   { background: hsl(0 74% 55%); }

	/* Account selector */
	.mm-account-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-bottom: 10px;
		border-bottom: 1px solid var(--color-border);
		margin-bottom: 2px;
	}
	.mm-acc-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 600;
		color: var(--color-muted-foreground);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.mm-acc-select {
		flex: 1;
		background: var(--color-muted);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-foreground);
		font-size: 12px;
		font-family: inherit;
		padding: 5px 8px;
		cursor: pointer;
		outline: none;
		transition: border-color 150ms;
	}
	.mm-acc-select:focus { border-color: var(--color-primary); }
	.mm-acc-select:disabled { opacity: 0.5; cursor: not-allowed; }

	/* Pipeline */
	.mm-pipe {
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.mm-pipe.running {
		border-color: hsl(32 100% 55% / 0.4);
	}
	.mm-pipe-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.mm-pipe-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.mm-pipe-txt .t  { font-size: 13px; font-weight: 500; color: var(--color-foreground); }
	.mm-pipe-txt .sub { font-size: 11px; color: var(--color-muted-foreground); }

	.mm-btn {
		background: var(--color-primary);
		color: hsl(210 40% 98%);
		border: none;
		border-radius: 7px;
		padding: 7px 14px;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: inherit;
		flex-shrink: 0;
	}
	.mm-btn:hover { background: hsl(222 47% 18%); }
	.mm-btn.ghost {
		background: var(--color-background);
		color: var(--color-muted-foreground);
		border: 1px solid var(--color-border);
	}
	.mm-btn.ghost:hover { background: var(--color-muted); color: var(--color-foreground); }

	.mm-stream {
		background: hsl(222 47% 6%);
		color: hsl(142 55% 75%);
		font-family: var(--font-mono);
		font-size: 11px;
		line-height: 1.55;
		border-radius: 6px;
		padding: 10px 12px;
		max-height: 180px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.mm-stream .line { display: block; }
	.mm-stream .line .ts { color: hsl(210 20% 50%); margin-right: 8px; }
	.mm-stream .line.info { color: hsl(210 20% 80%); }
	.mm-stream .line.ok   { color: hsl(142 60% 70%); }
	.mm-stream .line.warn { color: hsl(45 95% 70%); }
	.mm-stream .line.err  { color: hsl(0 80% 72%); }
	.mm-stream .cursor::after {
		content: "▌";
		color: hsl(142 71% 55%);
		animation: mm-blink 1s steps(2) infinite;
		margin-left: 2px;
	}
	@keyframes mm-blink {
		50% { opacity: 0; }
	}

	/* Recent mails */
	.mm-empty {
		font-size: 12px;
		color: var(--color-muted-foreground);
		padding: 12px;
		text-align: center;
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}
	.mm-recent {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		overflow: hidden;
		background: var(--color-background);
	}
	.mm-mail {
		display: grid;
		grid-template-columns: 14px 1fr auto;
		gap: 10px;
		padding: 9px 12px;
		border-bottom: 1px solid var(--color-border);
		align-items: start;
		transition: background 120ms ease;
	}
	.mm-mail:last-child { border-bottom: none; }
	.mm-mail:hover { background: var(--color-muted); }
	.mm-mail .dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		margin-top: 6px;
		margin-left: 4px;
		flex-shrink: 0;
	}
	.mm-mail .dot.ok   { background: hsl(142 71% 45%); }
	.mm-mail .dot.skip { background: hsl(215 16% 65%); }
	.mm-mail .dot.herm { background: hsl(32 100% 55%); }
	.mm-mail .dot.fail { background: hsl(0 74% 55%); }
	.mm-mail .cen { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.mm-mail .l1 {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--color-foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.3;
	}
	.mm-mail .l2 {
		font-size: 11px;
		color: var(--color-muted-foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.mm-mail .l2 .fr { font-family: var(--font-mono); font-size: 10.5px; }
	.mm-mail .l2 .out { margin-left: 8px; }
	.mm-mail .l2 .out.ok   { color: hsl(142 72% 29%); }
	.mm-mail .l2 .out.herm { color: hsl(25 95% 38%); }
	.mm-mail .l2 .out.skip { color: var(--color-muted-foreground); font-style: italic; }
	.mm-mail .l2 .out.fail { color: hsl(0 74% 42%); }
	.mm-mail .ts2 {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--color-muted-foreground);
		white-space: nowrap;
		margin-top: 2px;
	}

	/* Error panel */
	.mm-err {
		background: hsl(0 86% 97%);
		border: 1px solid hsl(0 96% 89%);
		border-radius: 8px;
		padding: 10px 12px;
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}
	.mm-err .ico { width: 18px; height: 18px; color: hsl(0 74% 42%); flex-shrink: 0; margin-top: 1px; }
	.mm-err .e-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
	.mm-err .e-t { font-size: 12.5px; font-weight: 600; color: hsl(0 74% 32%); }
	.mm-err .e-sub { font-size: 11px; color: hsl(0 55% 38%); line-height: 1.4; }
	.mm-err code {
		font-family: var(--font-mono);
		font-size: 10.5px;
		background: hsl(0 50% 92%);
		color: hsl(0 74% 30%);
		padding: 1px 5px;
		border-radius: 3px;
	}
	.mm-err .e-time {
		font-family: var(--font-mono);
		font-size: 10px;
		color: hsl(0 55% 42%);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-top: 2px;
	}

	/* Fallback */
	.mm-fallback {
		padding: 32px 24px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}
	.hero-ico {
		width: 56px;
		height: 56px;
		border-radius: 14px;
		background: var(--color-muted);
		color: var(--color-muted-foreground);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.mm-fallback h3 { font-size: 16px; font-weight: 600; color: var(--color-foreground); margin: 0; letter-spacing: -0.01em; }
	.mm-fallback p { font-size: 13px; color: var(--color-muted-foreground); line-height: 1.5; max-width: 420px; margin: 0; }
	.mm-fallback code {
		font-family: var(--font-mono);
		font-size: 11px;
		background: var(--color-muted);
		padding: 1px 5px;
		border-radius: 3px;
	}
	.f-actions { display: flex; gap: 8px; margin-top: 4px; }

	/* Footer */
	.mm-foot {
		padding: 10px 18px;
		border-top: 1px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--color-muted-foreground);
		letter-spacing: 0.04em;
	}
	.kbds { display: flex; align-items: center; gap: 6px; }
	.kbd {
		background: var(--color-muted);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		padding: 1px 6px;
		font-size: 10px;
	}

	@media (max-width: 640px) {
		.mm-status-grid { grid-template-columns: 1fr; }
	}
</style>
