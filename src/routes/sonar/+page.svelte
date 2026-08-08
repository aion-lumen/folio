<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Archive, ArrowRight, Bookmark, ExternalLink, Heart, LockKeyhole, Radar, ShieldCheck, Users } from 'lucide-svelte';
	import type { SonarDomain, SonarReviewStatus } from '$lib/server/modules/sonar/store.js';

	let { data } = $props();
	type View = 'inbox' | 'knowledge' | 'drafts' | 'sources';
	type DomainFilter = 'all' | SonarDomain;

	let view = $state<View>('inbox');
	let domain = $state<DomainFilter>('all');
	let selectedId = $state<string | null>(null);
	let overrides = $state<Record<string, SonarReviewStatus>>({});
	let saving = $state(false);
	let feedback = $state('');
	let feedbackError = $state(false);
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

	const notes = $derived(
		data.sonar.notes.map((note) => ({ ...note, status: overrides[note.postId] ?? note.status }))
	);
	const pendingCount = $derived(notes.filter((note) => note.status === 'pending' || note.status === 'deferred').length);
	const knowledgeCount = $derived(notes.filter((note) => note.status === 'accepted').length);
	const rejectedCount = $derived(notes.filter((note) => note.status === 'rejected').length);
	const reviewedCount = $derived(knowledgeCount + rejectedCount);
	const reviewPercent = $derived(notes.length ? Math.round((reviewedCount / notes.length) * 100) : 0);
	const visibleNotes = $derived(
		notes.filter((note) => {
			if (domain !== 'all' && !note.domains.includes(domain)) return false;
			if (view === 'inbox') return note.status === 'pending' || note.status === 'deferred';
			if (view === 'knowledge') return note.status === 'accepted';
			return false;
		})
	);
	const selected = $derived(visibleNotes.find((note) => note.postId === selectedId) ?? visibleNotes[0] ?? null);

	function clearFeedback() {
		if (feedbackTimer) clearTimeout(feedbackTimer);
		feedbackTimer = null;
		feedback = '';
		feedbackError = false;
	}

	function showFeedback(message: string, isError = false) {
		clearFeedback();
		feedback = message;
		feedbackError = isError;
		feedbackTimer = setTimeout(clearFeedback, isError ? 5000 : 2800);
	}

	onDestroy(clearFeedback);

	function chooseView(next: View) {
		view = next;
		selectedId = null;
		clearFeedback();
	}

	function formatDate(value: string | null): string {
		if (!value) return 'Datum unbekannt';
		const date = new Date(value);
		return Number.isNaN(date.valueOf())
			? value
			: new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
	}

	function formatCount(value: number): string {
		return new Intl.NumberFormat('de-CH').format(value);
	}

	async function review(status: 'accepted' | 'deferred' | 'rejected') {
		if (!selected || saving || !data.canReview) return;
		const reviewedPostId = selected.postId;
		saving = true;
		clearFeedback();
		try {
			const response = await fetch('/api/sonar/review', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ post_id: reviewedPostId, status })
			});
			if (!response.ok) throw new Error('review failed');
			overrides[reviewedPostId] = status;
			overrides = { ...overrides };
			selectedId = null;
			showFeedback(
				status === 'accepted'
					? 'Als Wissen bestätigt.'
					: status === 'deferred'
						? 'Für später zurückgestellt.'
						: 'Aus dem Eingang verworfen; der Audit-Eintrag bleibt erhalten.'
			);
		} catch {
			showFeedback('Die Entscheidung wurde nicht gespeichert. Der Eingang blieb unverändert.', true);
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Folio · Sonar</title></svelte:head>

<div class="sonar-page">
	<header class="sonar-heading">
		<div>
			<p class="kicker">Signale statt Feed</p>
			<h1>Sonar</h1>
			<p class="subtitle">Relevantes finden, als Wissen behalten, Antworten vorbereiten.</p>
		</div>
		<div class="source-state"><i></i><span>X · Altbestand · nur lesen</span></div>
	</header>

	{#if data.sonar.skippedNotes > 0 || !data.sonar.ledgerHealthy}
		<div class="integrity-notice" role="status">
			<ShieldCheck size={17} />
			<span>
				{#if data.sonar.skippedNotes > 0}{data.sonar.skippedNotes} ungültige Notiz(en) wurden ausgelassen. {/if}
				{#if !data.sonar.ledgerHealthy}Das Review-Ledger ist nicht vollständig lesbar; Entscheidungen sind gesperrt.{/if}
			</span>
		</div>
	{/if}

	<nav class="tabs" aria-label="Sonar-Bereiche">
		<button type="button" class:active={view === 'inbox'} aria-current={view === 'inbox' ? 'page' : undefined} onclick={() => chooseView('inbox')}>
			Eingang
			{#if pendingCount > 0}<span class="tab-indicator" aria-label="Offene Signale"></span>{/if}
			<span>{pendingCount}</span>
		</button>
		<button type="button" class:active={view === 'knowledge'} aria-current={view === 'knowledge' ? 'page' : undefined} onclick={() => chooseView('knowledge')}>Wissen <span>{knowledgeCount}</span></button>
		<button type="button" class:active={view === 'drafts'} aria-current={view === 'drafts' ? 'page' : undefined} onclick={() => chooseView('drafts')}>Entwürfe <span>0</span></button>
		<button type="button" class:active={view === 'sources'} aria-current={view === 'sources' ? 'page' : undefined} onclick={() => chooseView('sources')}>Quellen</button>
	</nav>

	{#if view === 'inbox' || view === 'knowledge'}
		<div class="toolbar">
			<button type="button" class:active={domain === 'all'} onclick={() => (domain = 'all')}>Alle</button>
			<button type="button" class:active={domain === 'ai'} onclick={() => (domain = 'ai')}>AI</button>
			<button type="button" class:active={domain === 'career'} onclick={() => (domain = 'career')}>Karriere</button>
			<span>{notes.length} lokale Notizen · kein automatischer Versand</span>
		</div>

		{#if visibleNotes.length > 0}
			<section class="workspace" aria-label={view === 'inbox' ? 'Sonar-Eingang' : 'Sonar-Wissen'}>
				<div class="signal-list" aria-label="Sonar-Signale">
					{#each visibleNotes as note (note.postId)}
						<button type="button" class="signal-row" class:selected={selected?.postId === note.postId} onclick={() => (selectedId = note.postId)}>
							<span class="signal-meta"><b>X</b><span>{formatDate(note.publishedAt)}</span><span>·</span><span>{note.signals.join(' + ')}</span></span>
							<strong>{note.title}</strong>
							<span class="preview">{note.reason}</span>
							{#if note.status === 'deferred'}<span class="status-pill">später</span>{/if}
						</button>
					{/each}
				</div>

				{#if selected}
					<article class="detail">
						<div class="detail-top">
							<span class="avatar"><Radar size={17} /></span>
							<div><strong>X-Signal</strong><span>{formatDate(selected.publishedAt)} · {selected.signals.join(' + ')}</span></div>
							<a href={selected.sourceUrl} target="_blank" rel="noreferrer" aria-label="Originalpost auf X öffnen"><ExternalLink size={16} /></a>
						</div>
						<h2>{selected.title}</h2>
						<p class="body">{selected.body}</p>
						<div class="context"><strong>Warum behalten?</strong><p>{selected.reason}</p></div>
						<div class="tags">
							{#each selected.domains as tag}<span>{tag === 'ai' ? 'AI' : 'Karriere'}</span>{/each}
							<span class="trust">external · Review</span>
						</div>

						{#if view === 'inbox'}
							<div class="actions">
								<button class="primary" type="button" disabled={saving || !data.canReview} onclick={() => review('accepted')}>Als Wissen behalten</button>
								<button type="button" disabled={saving || !data.canReview} onclick={() => review('deferred')}>Später</button>
								<button type="button" disabled={saving || !data.canReview} onclick={() => review('rejected')}>Verwerfen</button>
								<button class="draft" type="button" disabled title="Kommt im nächsten Sonar-Schnitt">Antwortentwurf</button>
							</div>
							<p class="human-gate">Kein Versand aus Folio · öffentliche Aktionen bleiben menschlich.</p>
						{/if}
					</article>
				{/if}
			</section>
		{:else}
			<div class="empty"><Radar size={24} /><strong>{view === 'inbox' ? 'Eingang ist leer' : 'Noch kein bestätigtes Wissen'}</strong><span>{domain === 'all' ? 'Hier erscheinen lokal aufbereitete Signale.' : 'Für diesen Filter gibt es noch keine Notizen.'}</span></div>
		{/if}
	{:else if view === 'drafts'}
		<div class="empty"><Radar size={24} /><strong>Entwürfe folgen im nächsten Schnitt</strong><span>Vorbereiten ja, veröffentlichen weiterhin nur durch dich.</span></div>
	{:else}
		<section class="sources-panel">
			<header class="archive-heading">
				<span class="archive-icon"><Archive size={21} /></span>
				<div>
					<p class="archive-eyebrow">Lokale Quelle</p>
					<h2>X-Archiv</h2>
					<p>Der historische Bestand ist gesichert. Sonar nimmt daraus später kleine, prüfbare Wellen.</p>
				</div>
				<span class="readonly-badge"><span class="source-dot"></span>{data.archiveDemo ? 'Demo · ' : ''}nur lesen</span>
			</header>

			{#if !data.archive.healthy}
				<div class="archive-warning" role="status">
					<ShieldCheck size={18} />
					<div><strong>Archiv nicht lesbar</strong><span>Die jüngsten Sonar-Notizen bleiben verfügbar; der Altbestand wird nicht verwendet.</span></div>
				</div>
			{:else if data.archive.summary}
				<div class="archive-flow" aria-label="Weg vom lokalen Archiv zum bestätigten Wissen">
					<div class="flow-step current"><span><Archive size={18} /></span><b>Archiv</b><small>lokal bereit</small></div>
					<ArrowRight size={17} />
					<div class="flow-step"><span>2</span><b>Kleine Wellen</b><small>bewusst begrenzt</small></div>
					<ArrowRight size={17} />
					<div class="flow-step"><span>3</span><b>Dein Review</b><small>behalten oder verwerfen</small></div>
					<ArrowRight size={17} />
					<div class="flow-step"><span>4</span><b>Wissen</b><small>erst nach Bestätigung</small></div>
				</div>

				<div class="archive-metrics">
					<article>
						<span class="metric-icon likes"><Heart size={19} /></span>
						<div><strong>{formatCount(data.archive.summary.likes)}</strong><span>Likes</span></div>
						<small>Wissenssignale, noch unsortiert</small>
					</article>
					<article>
						<span class="metric-icon follows"><Users size={19} /></span>
						<div><strong>{formatCount(data.archive.summary.following)}</strong><span>Abos</span></div>
						<small>Basis für die AI-/Politik-Trennung</small>
					</article>
					<article class:missing={data.archive.summary.bookmarks === 0}>
						<span class="metric-icon bookmarks"><Bookmark size={19} /></span>
						<div><strong>{formatCount(data.archive.summary.bookmarks)}</strong><span>Bookmarks</span></div>
						<small>{data.archive.summary.bookmarks === 0 ? 'Vom X-Archiv nicht geliefert' : 'Lokal für spätere Wellen bereit'}</small>
					</article>
				</div>

				<div class="source-next-grid">
					<article class="next-wave">
						<div class="card-label"><span>Nächster sinnvoller Schritt</span><b>noch nicht gestartet</b></div>
						<h3>Abos zuerst sortieren</h3>
						<p>{formatCount(data.archive.summary.following)} Konten sind endlich und direkt für den Umzug relevant. AI, Politik und Unklar lassen sich als erste überschaubare Welle prüfen.</p>
						<div class="sorting-preview" aria-label="Vorgesehene Sortierung in AI, Politik und Unklar">
							<span>AI</span><span>Politik</span><span>Unklar</span>
						</div>
					</article>

					<article class="recent-wave">
						<div class="card-label"><span>Jüngste Sonar-Welle</span><b>{reviewPercent}% geprüft</b></div>
						<div class="review-ring" style={`--reviewed: ${reviewPercent * 3.6}deg`} aria-label={`${reviewedCount} von ${notes.length} lokalen Notizen geprüft`}>
							<div><strong>{reviewedCount}</strong><span>von {notes.length}</span></div>
						</div>
						<p>{pendingCount} offen · {knowledgeCount} als Wissen behalten · {rejectedCount} verworfen</p>
					</article>
				</div>

				<footer class="archive-foot">
					<LockKeyhole size={15} />
					<span>Importiert am {formatDate(data.archive.summary.importedOn)} · Folio liest hier nur Summen, keine Posttexte. Keine Auto-Follows, Likes oder Veröffentlichungen.</span>
				</footer>
			{:else}
				<div class="archive-empty">
					<Archive size={25} />
					<div><strong>Noch kein normalisiertes X-Archiv</strong><span>Jüngste API-Signale und deine lokalen Sonar-Notizen funktionieren unabhängig davon weiter.</span></div>
				</div>
			{/if}
		</section>
	{/if}

	{#if feedback}<p class="feedback" class:error={feedbackError} role={feedbackError ? 'alert' : 'status'}>{feedback}</p>{/if}
</div>

<style>
	.sonar-page { --sonar: hsl(185 60% 34%); max-width: 1160px; margin: 0 auto; padding: 24px 16px 48px; color: var(--color-foreground); }
	.sonar-heading { display: flex; align-items: flex-start; gap: 18px; }
	.kicker { margin: 0 0 4px; color: var(--sonar); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
	h1 { margin: 0; font-size: 30px; font-weight: 500; letter-spacing: -.035em; }
	.subtitle { margin: 7px 0 0; color: var(--color-muted-foreground); }
	.source-state { margin-left: auto; display: flex; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-muted-foreground); background: var(--color-card); white-space: nowrap; font-size: 13px; }
	.source-state i, .source-dot { width: 7px; height: 7px; border-radius: 50%; background: hsl(145 45% 45%); }
	.integrity-notice { display: flex; gap: 8px; align-items: center; margin-top: 18px; padding: 10px 12px; border: 1px solid hsl(35 70% 72%); border-radius: 8px; background: hsl(42 80% 96%); color: hsl(30 60% 31%); font-size: 13px; }
	.tabs { display: flex; gap: 22px; margin-top: 26px; border-bottom: 1px solid var(--color-border); }
	.tabs button { position: relative; padding: 11px 1px 12px; border: 0; background: transparent; color: var(--color-muted-foreground); cursor: pointer; font: inherit; }
	.tabs button.active { color: var(--color-foreground); }
	.tabs button.active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--sonar); }
	.tabs span { margin-left: 4px; color: var(--color-muted-foreground); }
	.tabs .tab-indicator { display: inline-block; width: 6px; height: 6px; margin: 0 0 1px 6px; border-radius: 50%; background: var(--sonar); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sonar) 14%, transparent); }
	.toolbar { display: flex; align-items: center; gap: 8px; margin: 18px 0 12px; }
	.toolbar button { padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 7px; color: var(--color-muted-foreground); background: var(--color-card); cursor: pointer; }
	.toolbar button.active { color: var(--color-foreground); border-color: var(--sonar); }
	.toolbar > span { margin-left: auto; color: var(--color-muted-foreground); font-size: 12px; }
	.workspace { display: grid; grid-template-columns: minmax(260px, .8fr) minmax(0, 1.55fr); min-height: 500px; max-height: calc(100vh - 250px); border: 1px solid var(--color-border); border-radius: 11px; overflow: hidden; background: var(--color-card); }
	.signal-list { min-width: 0; overflow-y: auto; border-right: 1px solid var(--color-border); background: var(--color-background); }
	.signal-row { position: relative; width: 100%; display: block; padding: 15px 16px; border: 0; border-bottom: 1px solid var(--color-border); background: transparent; color: var(--color-foreground); text-align: left; cursor: pointer; }
	.signal-row:hover { background: var(--color-muted); }
	.signal-row.selected { background: var(--color-card); box-shadow: inset 3px 0 var(--sonar); }
	.signal-meta { display: flex; align-items: center; gap: 7px; color: var(--color-muted-foreground); font-size: 11px; }
	.signal-meta b { color: var(--sonar); font-weight: 600; }
	.signal-row strong { display: block; margin: 7px 0 5px; font-weight: 500; line-height: 1.35; }
	.preview { display: -webkit-box; overflow: hidden; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: var(--color-muted-foreground); font-size: 13px; line-height: 1.4; }
	.status-pill { display: inline-block; margin-top: 8px; padding: 2px 6px; border-radius: 5px; background: hsl(40 85% 92%); color: hsl(32 60% 33%); font-size: 11px; }
	.detail { min-width: 0; overflow-y: auto; padding: 24px; }
	.detail-top { display: flex; gap: 10px; align-items: center; color: var(--color-muted-foreground); font-size: 12px; }
	.detail-top .avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: color-mix(in srgb, var(--sonar) 12%, var(--color-card)); color: var(--sonar); }
	.detail-top div { display: flex; flex-direction: column; }
	.detail-top strong { color: var(--color-foreground); font-weight: 500; }
	.detail-top a { margin-left: auto; padding: 7px; border-radius: 7px; color: var(--color-muted-foreground); }
	.detail-top a:hover { background: var(--color-muted); color: var(--color-foreground); }
	.detail h2 { margin: 22px 0 10px; font-size: 20px; font-weight: 500; letter-spacing: -.02em; }
	.body { margin: 0 0 22px; white-space: pre-wrap; font-size: 17px; line-height: 1.55; overflow-wrap: anywhere; }
	.context { padding: 13px 14px; border-left: 2px solid var(--color-border); color: var(--color-muted-foreground); background: var(--color-background); font-size: 13px; }
	.context strong { color: var(--color-foreground); font-weight: 500; }
	.context p { margin: 5px 0 0; line-height: 1.5; }
	.tags { display: flex; gap: 7px; flex-wrap: wrap; margin: 20px 0; }
	.tags span { padding: 5px 8px; border-radius: 6px; color: var(--color-muted-foreground); background: var(--color-muted); font-size: 12px; }
	.tags .trust { color: hsl(32 70% 37%); }
	.actions { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 18px; border-top: 1px solid var(--color-border); }
	.actions button { padding: 8px 11px; border: 1px solid var(--color-border); border-radius: 7px; background: var(--color-card); color: var(--color-foreground); cursor: pointer; }
	.actions button.primary { border-color: var(--sonar); background: color-mix(in srgb, var(--sonar) 10%, var(--color-card)); }
	.actions button.draft { margin-left: auto; }
	.actions button:disabled { opacity: .48; cursor: not-allowed; }
	.human-gate { margin: 12px 0 0; color: var(--color-muted-foreground); font-size: 11px; text-align: right; }
	.empty { min-height: 340px; display: grid; place-content: center; justify-items: center; gap: 8px; margin-top: 18px; border: 1px solid var(--color-border); border-radius: 11px; color: var(--color-muted-foreground); background: var(--color-card); text-align: center; }
	.empty strong { color: var(--color-foreground); font-weight: 500; }
	.sources-panel { margin-top: 18px; padding: 22px; border: 1px solid var(--color-border); border-radius: 11px; background: var(--color-card); }
	.archive-heading { display: flex; align-items: flex-start; gap: 13px; }
	.archive-icon { display: grid; place-items: center; flex: 0 0 auto; width: 42px; height: 42px; border-radius: 10px; color: var(--sonar); background: color-mix(in srgb, var(--sonar) 11%, var(--color-card)); }
	.archive-heading > div { min-width: 0; }
	.archive-eyebrow { margin: 0 0 2px; color: var(--sonar); font-size: 10px; letter-spacing: .09em; text-transform: uppercase; }
	.archive-heading h2 { margin: 0; font-size: 20px; font-weight: 500; }
	.archive-heading p:last-child { margin: 5px 0 0; color: var(--color-muted-foreground); font-size: 13px; }
	.readonly-badge { display: flex; align-items: center; gap: 6px; margin-left: auto; padding: 5px 8px; border: 1px solid var(--color-border); border-radius: 999px; color: var(--color-muted-foreground); white-space: nowrap; font-size: 11px; }
	.archive-warning, .archive-empty { display: flex; align-items: center; gap: 12px; margin-top: 22px; padding: 18px; border-radius: 9px; background: var(--color-background); color: var(--color-muted-foreground); }
	.archive-warning { color: hsl(2 58% 40%); background: hsl(0 75% 96%); }
	.archive-warning div, .archive-empty div { display: flex; flex-direction: column; gap: 3px; }
	.archive-warning strong, .archive-empty strong { color: var(--color-foreground); font-weight: 500; }
	.archive-warning span, .archive-empty span { font-size: 12px; }
	.archive-flow { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr; align-items: center; gap: 10px; margin: 26px 0; padding: 17px 18px; border-radius: 10px; background: var(--color-background); color: var(--color-muted-foreground); }
	.flow-step { display: grid; grid-template-columns: 30px 1fr; align-items: center; column-gap: 9px; min-width: 0; }
	.flow-step > span { grid-row: 1 / 3; display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid var(--color-border); border-radius: 50%; font-size: 11px; }
	.flow-step b { color: var(--color-foreground); font-size: 12px; font-weight: 500; }
	.flow-step small { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 10px; }
	.flow-step.current > span { border-color: var(--sonar); color: white; background: var(--sonar); }
	.archive-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
	.archive-metrics article { display: grid; grid-template-columns: 40px 1fr; align-items: center; gap: 10px; padding: 16px; border: 1px solid var(--color-border); border-radius: 10px; }
	.metric-icon { grid-row: 1 / 3; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; }
	.metric-icon.likes { color: hsl(347 58% 48%); background: hsl(347 70% 95%); }
	.metric-icon.follows { color: hsl(206 62% 43%); background: hsl(206 75% 95%); }
	.metric-icon.bookmarks { color: hsl(37 67% 42%); background: hsl(40 78% 94%); }
	.archive-metrics article > div { display: flex; align-items: baseline; gap: 6px; }
	.archive-metrics strong { font-size: 22px; font-weight: 500; letter-spacing: -.03em; }
	.archive-metrics article > div span { color: var(--color-muted-foreground); font-size: 12px; }
	.archive-metrics small { grid-column: 2; color: var(--color-muted-foreground); font-size: 10px; }
	.archive-metrics article.missing { opacity: .72; }
	.source-next-grid { display: grid; grid-template-columns: 1.4fr .8fr; gap: 12px; margin-top: 12px; }
	.source-next-grid article { padding: 17px; border-radius: 10px; background: var(--color-background); }
	.card-label { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--color-muted-foreground); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; }
	.card-label b { padding: 3px 6px; border-radius: 5px; color: var(--sonar); background: color-mix(in srgb, var(--sonar) 10%, var(--color-card)); font-weight: 500; letter-spacing: 0; text-transform: none; }
	.next-wave h3 { margin: 16px 0 6px; font-size: 18px; font-weight: 500; }
	.next-wave p, .recent-wave p { margin: 0; color: var(--color-muted-foreground); font-size: 12px; line-height: 1.5; }
	.sorting-preview { display: grid; grid-template-columns: 1.2fr 1fr .7fr; gap: 3px; margin-top: 17px; }
	.sorting-preview span { padding: 7px; color: var(--color-muted-foreground); background: var(--color-card); font-size: 10px; text-align: center; }
	.sorting-preview span:first-child { border-radius: 7px 0 0 7px; box-shadow: inset 0 -2px var(--sonar); }
	.sorting-preview span:last-child { border-radius: 0 7px 7px 0; }
	.review-ring { display: grid; place-items: center; width: 96px; height: 96px; margin: 14px auto 10px; border-radius: 50%; background: conic-gradient(var(--sonar) var(--reviewed), var(--color-border) 0); }
	.review-ring::before { content: ''; grid-area: 1 / 1; width: 72px; height: 72px; border-radius: 50%; background: var(--color-background); }
	.review-ring div { z-index: 1; grid-area: 1 / 1; display: flex; flex-direction: column; align-items: center; }
	.review-ring strong { font-size: 20px; font-weight: 500; }
	.review-ring span { color: var(--color-muted-foreground); font-size: 10px; }
	.recent-wave p { text-align: center; }
	.archive-foot { display: flex; align-items: center; gap: 7px; margin-top: 15px; color: var(--color-muted-foreground); font-size: 10px; }
	.feedback { margin: 12px 0 0; padding: 9px 11px; border-radius: 7px; background: color-mix(in srgb, var(--sonar) 10%, var(--color-card)); color: var(--sonar); font-size: 13px; }
	.feedback.error { background: hsl(0 80% 96%); color: hsl(0 65% 36%); }
	@media (max-width: 700px) {
		.sonar-page { padding: 20px 0 40px; }
		.sonar-heading { flex-wrap: wrap; }
		.source-state { margin-left: 0; }
		.tabs { gap: 14px; overflow-x: auto; }
		.tabs button { white-space: nowrap; }
		.toolbar { flex-wrap: wrap; }
		.toolbar > span { width: 100%; margin-left: 0; }
		.workspace { grid-template-columns: 1fr; max-height: none; }
		.signal-list { max-height: 260px; border-right: 0; border-bottom: 1px solid var(--color-border); }
		.detail { padding: 20px 16px; }
		.actions button.draft { margin-left: 0; }
		.human-gate { text-align: left; }
		.archive-heading { flex-wrap: wrap; }
		.readonly-badge { margin-left: 55px; }
		.archive-flow { grid-template-columns: 1fr; }
		.archive-flow > :global(svg) { transform: rotate(90deg); justify-self: center; }
		.archive-metrics, .source-next-grid { grid-template-columns: 1fr; }
	}
</style>
