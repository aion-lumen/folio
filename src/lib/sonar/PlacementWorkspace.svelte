<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { Check, Copy, Clock3, ExternalLink, MessageSquareText, Radar, Save, ShieldCheck, Trash2 } from 'lucide-svelte';
	import SlideToConfirm from '$lib/components/SlideToConfirm.svelte';
	import { freshPlacementCandidates } from './placement-status.js';
	import type {
		SonarPlacementCandidate,
		SonarPlacementChannel,
		SonarPlacementState
	} from '$lib/server/modules/sonar/placements.js';
	import type { SonarPublicationState } from '$lib/server/modules/sonar/publications.js';

	let {
		placementState,
		publicationState,
		canReview,
		canApprove,
		initialCandidateId = null,
		compact = false
	}: {
		placementState: SonarPlacementState;
		publicationState: SonarPublicationState;
		canReview: boolean;
		canApprove: boolean;
		initialCandidateId?: string | null;
		compact?: boolean;
	} = $props();
	let showHistory = $state(untrack(() => Boolean(initialCandidateId && placementState.candidates.some(c => c.id === initialCandidateId && (c.status !== 'open' || Date.now()-Date.parse(c.source.publishedAt) >= 24*3_600_000)))));
	let now = $state(Date.now());
	let draftElement = $state<HTMLTextAreaElement>();
	let detailElement = $state<HTMLElement>();
	onMount(() => { const timer = setInterval(() => { now = Date.now(); }, 30000); return () => clearInterval(timer); });
	let selectedId = $state<string | null>(untrack(() => initialCandidateId));
	let overrides = $state<Record<string, Partial<SonarPlacementCandidate>>>({});
	let draftText = $state('');
	let draftKey = $state('');
	let saving = $state(false);
	let feedback = $state('');
	let feedbackError = $state(false);
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
	const candidates = $derived(
		placementState.candidates.map((candidate) => {
			const override = overrides[candidate.id];
			return override
				? { ...candidate, ...override, draft: override.draft ?? candidate.draft }
				: candidate;
		})
	);
 const fresh = $derived(freshPlacementCandidates(candidates, now));
 const visibleCandidates = $derived(showHistory ? candidates : fresh.slice(0, 3));
 const selected = $derived(candidates.find(c => c.id === selectedId && (showHistory || fresh.some(f => f.id === c.id))) ?? visibleCandidates[0] ?? null);
 async function copyDraft() {
  try { await navigator.clipboard.writeText(draftText); showFeedback('Kopiert. Im Originalbeitrag kannst du die Antwort einfügen.'); }
  catch { draftElement?.focus(); draftElement?.select(); showFeedback('Text markiert. Bitte über das Textmenü kopieren.', true); }
 }
 function choose(id: string) {
  if (draftChanged && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
  selectedId = id;
  if (compact) setTimeout(() => detailElement?.scrollIntoView({block:'start',behavior:'smooth'}), 0);
 }
	const selectedPublication = $derived(selected ? publicationState.byCandidate[selected.id] : undefined);
	const openCount = $derived(
		fresh.length
	);
	const draftChanged = $derived(Boolean(selected && draftText !== selected.draft.text));

	const CHANNEL_LABELS: Record<SonarPlacementChannel, string> = {
		x: 'X',
		reddit: 'Reddit',
		'hacker-news': 'Hacker News',
		linkedin: 'LinkedIn',
		discord: 'Discord',
		other: 'Web'
	};

	function formatDate(value: string): string {
		return new Intl.DateTimeFormat('de-CH', {
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(value));
	}

	function remaining(candidate: SonarPlacementCandidate): string {
		if (candidate.status === 'dismissed') return 'nicht verwendet';
		if (candidate.status === 'approved') return Date.parse(candidate.expiresAt) <= now ? 'Freigabe abgelaufen' : 'freigegeben';
		if (candidate.status === 'expired') return 'abgelaufen';
		const hours = Math.max(0, (Date.parse(candidate.expiresAt) - Date.now()) / 3_600_000);
		if (hours < 1) return 'weniger als 1 Stunde';
		if (hours < 24) return `noch ${Math.ceil(hours)} Stunden`;
		const days = Math.max(1, Math.round(hours / 24));
		return `noch ${days} ${days === 1 ? 'Tag' : 'Tage'}`;
	}

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

	$effect(() => {
		const key = selected ? `${selected.id}:${selected.draft.revision}` : '';
		if (key !== draftKey) {
			draftKey = key;
			draftText = selected?.draft.text ?? '';
		}
	});

	async function placementAction(action: 'revise' | 'dismiss' | 'approve' | 'revoke') {
		if (
			!selected ||
			saving ||
			!canReview ||
			(action === 'revoke' ? selected.status !== 'approved' : selected.status !== 'open')
		) return;
		const candidate = selected;
		if (action === 'revise' && (!draftText.trim() || !draftChanged)) return;
		saving = true;
		clearFeedback();
		try {
			const response = await fetch('/api/sonar/placement-review', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					candidate_id: candidate.id,
					candidate_hash: candidate.candidateHash,
					expected_revision: candidate.draft.revision,
					action,
					...(action === 'revise' ? { draft_text: draftText } : {})
				})
			});
			if (!response.ok) throw new Error('placement review failed');
			const payload = (await response.json()) as {
				review: { revision: number; reviewed_at: string; draft_text?: string };
			};
			if (action === 'revise') {
				overrides[candidate.id] = {
					draft: {
						revision: payload.review.revision,
						text: payload.review.draft_text ?? draftText,
						generatedAt: payload.review.reviewed_at,
						generatedBy: 'human:folio'
					},
					reviewedAt: payload.review.reviewed_at
				};
				overrides = { ...overrides };
				showFeedback(`Entwurf als Revision ${payload.review.revision} gespeichert.`);
			} else if (action === 'dismiss') {
				overrides[candidate.id] = {
					...overrides[candidate.id],
					status: 'dismissed',
					reviewedAt: payload.review.reviewed_at
				};
				overrides = { ...overrides };
				selectedId = candidates.find((item) => item.id !== candidate.id && item.status === 'open')?.id ?? candidate.id;
				showFeedback('Vorschlag nicht verwendet. Der Entscheid bleibt lokal nachvollziehbar.');
			} else if (action === 'approve') {
				overrides[candidate.id] = {
					...overrides[candidate.id],
					status: 'approved',
					reviewedAt: payload.review.reviewed_at
				};
				overrides = { ...overrides };
				selectedId = candidates.find((item) => item.id !== candidate.id && item.status === 'open')?.id ?? candidate.id;
				showFeedback('Freigabe lokal protokolliert. Es wurde noch nichts veröffentlicht.');
			} else {
				overrides[candidate.id] = {
					...overrides[candidate.id],
					status: 'open',
					reviewedAt: payload.review.reviewed_at
				};
				overrides = { ...overrides };
				showFeedback('Freigabe zurückgezogen. Der Entwurf kann wieder bearbeitet werden.');
			}
		} catch {
			showFeedback('Die Änderung wurde nicht gespeichert. Bitte Ansicht neu laden und erneut prüfen.', true);
		} finally {
			saving = false;
		}
	}

</script>

{#if !placementState.healthy}
	<div class="placement-warning" role="status">
		<ShieldCheck size={18} />
		<div>
			<strong>Platzierungseingang nicht sicher lesbar</strong>
			<span>Sonar blendet die Quelle aus und verändert keine Dateien.</span>
		</div>
	</div>
{:else if placementState.candidates.length === 0}
	<div class="placement-empty">
		<Radar size={28} />
		<strong>Das Radar wartet auf den ersten Suchlauf</strong>
		<span>Hier erscheinen bis zu drei aktuelle Beiträge mit einem passenden Antwortentwurf.</span>
		<small>Kein Feed, keine automatische Veröffentlichung.</small>
	</div>
{:else}
	<div class="placement-summary">
		<div><Radar size={16} /><strong>{openCount}</strong><span>Gelegenheiten der letzten 24 Stunden</span></div>
		<p>Prüfen · anpassen · kopieren · im Original antworten</p>
	</div>

	{#if placementState.skippedCandidates > 0}
		<div class="placement-warning compact" role="status">
			<ShieldCheck size={15} />
			<span>{placementState.skippedCandidates} ungültige Kandidat(en) wurden ausgelassen.</span>
		</div>
	{/if}
	{#if !placementState.ledgerHealthy}
		<div class="placement-warning compact" role="status">
			<ShieldCheck size={15} />
			<span>Das Entscheidungsprotokoll ist nicht vollständig lesbar. Bearbeitung bleibt gesperrt.</span>
		</div>
	{/if}
	{#if !publicationState.healthy}
		<div class="placement-warning compact" role="status">
			<ShieldCheck size={15} />
			<span>Das Veröffentlichungsprotokoll ist nicht sicher lesbar. Der Publisher bleibt gesperrt.</span>
		</div>
	{/if}
	{#if feedback}
		<div class:feedback-error={feedbackError} class="placement-feedback" role="status">
			{#if feedbackError}<ShieldCheck size={15} />{:else}<Check size={15} />{/if}
			<span>{feedback}</span>
		</div>
	{/if}

 <button class="history-toggle" type="button" onclick={() => { if (!draftChanged || window.confirm('Ungespeicherte Änderungen verwerfen?')) { showHistory = !showHistory; selectedId = null; } }}>
  {showHistory ? 'Aktuelle Vorschläge' : `Verlauf (${candidates.length - fresh.length}) und weitere Vorschläge`}
 </button>
 {#if !showHistory && fresh.length === 0}<p class="no-current">Gerade keine aktuellen Vorschläge. Ältere Beiträge findest du im Verlauf.</p>{/if}
 <section class:compact class="placement-workspace" aria-label="Sonar-Platzierungsradar">
		<div class="placement-list" aria-label="Beitragsgelegenheiten">
			{#each visibleCandidates as candidate (candidate.id)}
				<button
					type="button"
					class:selected={selected?.id === candidate.id}
					class:expired={candidate.status === 'expired'}
					class:dismissed={candidate.status === 'dismissed'}
					class:approved={candidate.status === 'approved'}
					onclick={() => choose(candidate.id)}
				>
					<span class="placement-meta">
						<b>{CHANNEL_LABELS[candidate.channel]}</b>
						<span>@{candidate.source.authorHandle}</span>
						<span>·</span>
						<span>{remaining(candidate)}</span>
					</span>
					<strong>{candidate.relevance.suggestedAngle}</strong>
					<span class="placement-preview">{candidate.source.text}</span>
				</button>
			{/each}
		</div>

		{#if selected}
			<article class="placement-detail" bind:this={detailElement}>
				<header>
					<span class="placement-avatar"><MessageSquareText size={17} /></span>
					<div>
						<strong>{CHANNEL_LABELS[selected.channel]} · @{selected.source.authorHandle}</strong>
						<span>{selected.source.authorName} · {formatDate(selected.source.publishedAt)}</span>
					</div>
					<a href={selected.source.url} target="_blank" rel="noreferrer" aria-label="Originalbeitrag öffnen">
						<ExternalLink size={16} />
					</a>
				</header>

				<details class="original-source"><summary>Originalbeitrag lesen</summary><p class="source-text">{selected.source.text}</p></details>

				<details class="placement-context"><summary>Warum dieser Vorschlag?</summary>
					<div><strong>Warum hier?</strong><p>{selected.relevance.reason}</p></div>
					</details>

    {#if selected.relevance.references?.length}
     <div class="own-reference"><strong>Dein passender Beitrag</strong>
      {#each selected.relevance.references as reference}
       <a href={reference.url} target="_blank" rel="noreferrer">{reference.title} <ExternalLink size={14}/></a><p>{reference.claim}</p>
      {/each}
     </div>
    {/if}
    <div class="placement-tags">
					{#each selected.relevance.domains as domain}
						<span>{domain === 'ai' ? 'AI' : 'Karriere'}</span>
					{/each}
					<span>Ziel: @{selected.targetAccount}</span>
					<span class:expired={selected.status === 'expired'}>
						<Clock3 size={12} /> {remaining(selected)}
					</span>
				</div>

				<section class:locked={selected.status !== 'open'} class="draft-card">
					<header>
						<div><span>Antwortentwurf</span><strong>Revision {selected.draft.revision}</strong></div>
						<small>{selected.draft.generatedBy}</small>
					</header>
					<textarea
						bind:value={draftText}
						bind:this={draftElement}
						disabled={!canReview || selected.status !== 'open' || saving}
						maxlength="4000"
						aria-label="Antwortentwurf bearbeiten"
					></textarea>
					<div class="draft-actions">
						<span>{draftText.length} Zeichen</span>
						<button
							type="button"
							class="dismiss-button"
							disabled={!canReview || selected.status !== 'open' || saving}
							onclick={() => placementAction('dismiss')}
						><Trash2 size={14} /> Nicht verwenden</button>
						<button
							type="button"
							class="save-button"
							disabled={!canReview || selected.status !== 'open' || saving || !draftChanged || !draftText.trim()}
							onclick={() => placementAction('revise')}
						><Save size={14} /> Änderungen speichern</button>
					</div>
				</section>

    <div class="manual-actions">
     <button type="button" onclick={copyDraft} disabled={!draftText.trim()}><Copy size={18}/> Antwort kopieren</button>
     <a href={selected.source.url} target="_blank" rel="noreferrer">Original öffnen <ExternalLink size={18}/></a>
    </div>
    {#if selected.status === 'open'}
     <details class="publisher-options"><summary>Über den Publisher freigeben</summary>
					<section class:disabled={!canApprove || saving || draftChanged} class="publish-approval">
						<div>
							<strong>Zur Veröffentlichung freigeben</strong>
							<span>{draftChanged ? 'Änderungen zuerst speichern' : 'Nach rechts schieben · Freigabe bleibt revisionsgebunden'}</span>
						</div>
						<SlideToConfirm
							label="Entwurf freigeben"
							hint="Am Griff nach rechts ziehen"
							disabled={!canApprove || draftChanged}
							busy={saving}
							resetKey={`${selected.id}:${selected.draft.revision}`}
							onconfirm={() => placementAction('approve')}
						/>
						<small>Dieser Schritt speichert nur deine Freigabe. Die Veröffentlichung erfolgt separat durch den Publisher.</small>
					</section>
				</details>
				{:else if selected.status === 'approved'}
					<section
						class:published={selectedPublication?.status === 'published'}
						class:unclear={selectedPublication?.status === 'unclear'}
						class:manual-required={selectedPublication?.status === 'manual_required'}
						class="publish-approved"
					>
						{#if selectedPublication?.status === 'unclear'}<ShieldCheck size={17} />{:else}<Check size={17} />{/if}
						<div>
							{#if selectedPublication?.status === 'published'}
								<strong>Auf X veröffentlicht</strong>
								<a href={selectedPublication.externalUrl} target="_blank" rel="noreferrer">Antwort öffnen <ExternalLink size={12} /></a>
							{:else if selectedPublication?.status === 'unclear'}
								<strong>Ergebnis auf X prüfen</strong><span>Die Anfrage wurde gestartet, aber lokal nicht eindeutig bestätigt. Kein automatischer Neuversuch.</span>
							{:else if Date.parse(selected.expiresAt) <= now && selectedPublication?.status !== 'claimed'}
								<strong>Freigabe abgelaufen</strong><span>Der Publisher versendet diesen Entwurf nicht mehr. Die frühere Freigabe bleibt im Verlauf.</span>
							{:else if selectedPublication?.status === 'manual_required'}
								<strong>In X fertigstellen</strong>
								<span>X erlaubt diesen API-Reply nicht. Der Entwurf öffnet vorbefüllt; der letzte Klick bleibt bei dir.</span>
								<a href={selectedPublication.intentUrl} target="_blank" rel="noreferrer">Antwort in X öffnen <ExternalLink size={12} /></a>
							{:else if selectedPublication?.status === 'claimed'}
								<strong>Vom Publisher übernommen</strong><span>Der Versandversuch ist protokolliert. Ansicht gleich erneut laden.</span>
							{:else}
								<strong>Zur Veröffentlichung freigegeben</strong>
								<span>Wartet auf den getrennt authentifizierten Publisher.</span>
								<button
									type="button"
									disabled={!canApprove || !canReview || saving}
									onclick={() => placementAction('revoke')}
								>Freigabe zurückziehen</button>
							{/if}
						</div>
					</section>
				{/if}

				<footer>
					<ShieldCheck size={15} />
					<span>Lokal bearbeitbar · Freigabe und Netzwerkaktion bleiben getrennt.</span>
				</footer>
			</article>
		{/if}
	</section>
{/if}

<style>
 .history-toggle { margin-bottom: 10px; min-height:44px; padding:8px 12px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-card); font-size:14px; }
 .no-current { padding:20px 10px; color:var(--color-muted-foreground); }
 .original-source summary, .publisher-options summary { cursor:pointer; padding:14px 0; font-size:14px; }
 .own-reference { margin-top:14px; padding:14px; background:color-mix(in srgb,var(--sonar) 7%,var(--color-card)); border-radius:10px; }
 .own-reference strong { display:block; font-size:12px; }
 .own-reference a { display:flex; gap:6px; align-items:center; padding:8px 0; font-size:14px; text-decoration:underline; }
 .own-reference p { font-size:13px; line-height:1.5; margin:0; }
 .manual-actions { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap; }
 .manual-actions button,.manual-actions a { display:flex; align-items:center; justify-content:center; gap:8px; min-height:48px; padding:10px 14px; border:1px solid var(--sonar); border-radius:10px; font-size:14px; flex:1; text-align:center; }
 .manual-actions button { background:var(--sonar); color:white; }
 .manual-actions a { color:var(--sonar); }
 .placement-detail { scroll-margin-top:75px; }

	.placement-empty { min-height: 360px; display: grid; place-content: center; justify-items: center; gap: 8px; margin-top: 18px; border: 1px solid var(--color-border); border-radius: 11px; color: var(--color-muted-foreground); background: var(--color-card); text-align: center; }
	.placement-empty strong { color: var(--color-foreground); font-weight: 500; }
	.placement-empty small { margin-top: 4px; font-size: 10px; }
	.placement-warning { display: flex; align-items: center; gap: 10px; margin-top: 18px; padding: 16px; border-radius: 9px; color: hsl(2 58% 40%); background: hsl(0 75% 96%); }
	.placement-warning div { display: flex; flex-direction: column; gap: 3px; }
	.placement-warning strong { color: var(--color-foreground); font-weight: 500; }
	.placement-warning span { font-size: 12px; }
	.placement-warning.compact { margin: 10px 0; padding: 9px 11px; }
	.placement-feedback { display: flex; align-items: center; gap: 7px; margin: 10px 0; padding: 9px 11px; border-radius: 8px; color: hsl(156 42% 32%); background: hsl(150 38% 94%); font-size: 11px; }
	.placement-feedback.feedback-error { color: hsl(2 58% 40%); background: hsl(0 75% 96%); }
	.placement-summary { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 18px 0 12px; }
	.placement-summary div { display: flex; align-items: center; gap: 7px; color: var(--sonar); }
	.placement-summary strong { font-size: 18px; font-weight: 500; }
	.placement-summary span, .placement-summary p { color: var(--color-muted-foreground); font-size: 11px; }
	.placement-summary p { margin: 0; text-align: right; }
	.placement-workspace { display: grid; grid-template-columns: minmax(270px, .8fr) minmax(0, 1.55fr); min-height: 0; max-height: calc(100vh - 245px); border: 1px solid var(--color-border); border-radius: 11px; overflow: hidden; background: var(--color-card); }
	.placement-list { min-width: 0; overflow-y: auto; border-right: 1px solid var(--color-border); background: var(--color-background); }
	.placement-list button { display: block; width: 100%; padding: 15px 16px; border: 0; border-bottom: 1px solid var(--color-border); color: var(--color-foreground); background: transparent; text-align: left; cursor: pointer; }
	.placement-list button:hover { background: var(--color-muted); }
	.placement-list button.selected { background: var(--color-card); box-shadow: inset 3px 0 var(--sonar); }
	.placement-list button.expired, .placement-list button.dismissed { opacity: .62; }
	.placement-list button.dismissed { background: var(--color-muted); }
	.placement-list button.approved { box-shadow: inset 3px 0 hsl(156 42% 42%); }
	.placement-meta { display: flex; align-items: center; gap: 6px; color: var(--color-muted-foreground); font-size: 10px; }
	.placement-meta b { color: var(--sonar); font-weight: 600; }
	.placement-list button > strong { display: block; margin: 7px 0 5px; font-size: 13px; font-weight: 500; line-height: 1.4; }
	.placement-preview { display: -webkit-box; overflow: hidden; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: var(--color-muted-foreground); font-size: 12px; line-height: 1.4; }
	.placement-detail { min-width: 0; overflow-y: auto; padding: 24px; }
	.placement-detail > header { display: flex; align-items: center; gap: 10px; color: var(--color-muted-foreground); font-size: 11px; }
	.placement-avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; color: var(--sonar); background: color-mix(in srgb, var(--sonar) 12%, var(--color-card)); }
	.placement-detail > header div { display: flex; flex-direction: column; gap: 2px; }
	.placement-detail > header strong { color: var(--color-foreground); font-weight: 500; }
	.placement-detail > header a { margin-left: auto; padding: 7px; border-radius: 7px; color: var(--color-muted-foreground); }
	.placement-detail > header a:hover { color: var(--color-foreground); background: var(--color-muted); }
	.source-text { margin: 22px 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 16px; line-height: 1.55; }
	.placement-context { margin: 12px 0; }
	.placement-context summary { padding:12px 0; cursor:pointer; font-size:14px; }
	.placement-context div { padding: 13px 14px; border-left: 2px solid var(--color-border); background: var(--color-background); }
	.placement-context strong { font-size: 11px; font-weight: 500; }
	.placement-context p { margin: 5px 0 0; color: var(--color-muted-foreground); font-size: 12px; line-height: 1.45; }
	.placement-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0; }
	.placement-tags span { display: inline-flex; align-items: center; gap: 4px; padding: 4px 7px; border-radius: 6px; color: var(--color-muted-foreground); background: var(--color-muted); font-size: 10px; }
	.placement-tags span.expired { color: hsl(2 58% 40%); background: hsl(0 75% 96%); }
	.draft-card { margin-top: 20px; border: 1px solid color-mix(in srgb, var(--sonar) 35%, var(--color-border)); border-radius: 10px; overflow: hidden; }
	.draft-card > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 13px; background: color-mix(in srgb, var(--sonar) 7%, var(--color-card)); }
	.draft-card > header div { display: flex; align-items: center; gap: 7px; }
	.draft-card > header span { color: var(--sonar); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
	.draft-card > header strong, .draft-card > header small { color: var(--color-muted-foreground); font-size: 9px; font-weight: 500; }
	.draft-card textarea { display: block; width: 100%; min-height: 145px; resize: vertical; padding: 17px; border: 0; border-top: 1px solid var(--color-border); outline: none; box-sizing: border-box; color: var(--color-foreground); background: var(--color-card); font: inherit; font-size: 16px; line-height: 1.55; }
	.draft-card textarea:focus { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--sonar) 28%, transparent); }
	.draft-card textarea:disabled { opacity: .75; cursor: not-allowed; }
	.draft-card.locked { border-color: var(--color-border); }
	.draft-actions { display: flex; align-items: center; gap: 8px; padding: 9px 11px; border-top: 1px solid var(--color-border); background: var(--color-background); }
	.draft-actions > span { margin-right: auto; color: var(--color-muted-foreground); font-size: 9px; }
	.draft-actions button { display: inline-flex; align-items: center; gap: 5px; min-height: 34px; padding: 7px 10px; border: 1px solid var(--color-border); border-radius: 7px; font-size: 10px; cursor: pointer; }
	.draft-actions button:disabled { opacity: .45; cursor: not-allowed; }
	.dismiss-button { color: var(--color-muted-foreground); background: var(--color-card); }
	.save-button { border-color: var(--sonar) !important; color: white; background: var(--sonar); }
	.publish-approval { display: grid; grid-template-columns: minmax(0, 1fr) minmax(190px, 250px); align-items: center; gap: 14px; margin-top: 14px; padding: 13px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-background); }
	.publish-approval > div { display: flex; flex-direction: column; gap: 3px; }
	.publish-approval strong { font-size: 11px; font-weight: 500; }
	.publish-approval div span, .publish-approval small { color: var(--color-muted-foreground); font-size: 9px; line-height: 1.4; }
	.publish-approval small { grid-column: 1 / -1; }
	.publish-approval.disabled { opacity: .55; }
	.publish-approved { display: flex; align-items: center; gap: 9px; margin-top: 14px; padding: 13px; border: 1px solid hsl(156 35% 72%); border-radius: 10px; color: hsl(156 42% 32%); background: hsl(150 38% 94%); }
	.publish-approved div { display: flex; flex-direction: column; gap: 2px; }
	.publish-approved strong { font-size: 11px; font-weight: 500; }
	.publish-approved span { font-size: 9px; }
	.publish-approved a { display: inline-flex; align-items: center; gap: 4px; color: inherit; font-size: 10px; text-decoration: underline; text-underline-offset: 2px; }
	.publish-approved button { width: fit-content; margin-top: 4px; padding: 4px 7px; border: 1px solid currentColor; border-radius: 6px; color: inherit; background: transparent; font-size: 9px; cursor: pointer; }
	.publish-approved button:disabled { opacity: .45; cursor: not-allowed; }
	.publish-approved.published { border-color: hsl(156 42% 58%); background: hsl(150 42% 92%); }
	.publish-approved.unclear { border-color: hsl(35 74% 68%); color: hsl(28 68% 31%); background: hsl(38 85% 94%); }
	.publish-approved.manual-required { border-color: color-mix(in srgb, var(--sonar) 50%, var(--color-border)); color: var(--sonar); background: color-mix(in srgb, var(--sonar) 8%, var(--color-card)); }
	.placement-detail > footer { display: flex; align-items: center; gap: 7px; margin-top: 15px; color: var(--color-muted-foreground); font-size: 10px; }
	@media (max-width: 700px) {
		.placement-summary { align-items: flex-start; flex-direction: column; gap: 3px; }
		.placement-summary p { text-align: left; }
		.placement-workspace { grid-template-columns: 1fr; max-height: none; }
		.placement-list { max-height: 250px; border-right: 0; border-bottom: 1px solid var(--color-border); }
		.placement-detail { padding: 20px 15px; }

		.draft-actions { flex-wrap: wrap; }
		.draft-actions > span { width: 100%; }
		.draft-actions button { flex: 1; justify-content: center; }
		.publish-approval { grid-template-columns: 1fr; }
		.publish-approval small { grid-column: auto; }
	}
	.placement-workspace.compact { grid-template-columns: 1fr; max-height: none; }
	.placement-workspace.compact .placement-list { max-height: 210px; border-right: 0; border-bottom: 1px solid var(--color-border); }
	.placement-workspace.compact .placement-detail { padding: 20px 15px; }
	.placement-workspace.compact .draft-actions { flex-wrap: wrap; }
	.placement-workspace.compact .draft-actions > span { width: 100%; }
	.placement-workspace.compact .draft-actions button { flex: 1; justify-content: center; min-height:44px; font-size:13px; }
	.placement-workspace.compact .publish-approval { grid-template-columns: 1fr; }
	.placement-workspace.compact .publish-approval small { grid-column: auto; }
</style>
