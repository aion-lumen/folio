<!--
  Panel-C Werkstatt §1.2: das Hauptelement.
  Weißer BG, 4px Ember-Top-Border bei ne/ne-strong, Eyebrow, Domain-Pills (8),
  Action-Buttons (2: Aktionable + Archiv-stumm), Stumm-Grund-Chips multiselect,
  Notiz-textarea on-blur.
-->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import {
		DOMAIN_KEYS,
		DOMAIN_LABELS,
		DOMAIN_CLASS,
		type DomainKey,
		type ActionabilityKey
	} from '$lib/util/mail-account.js';
	import type { UnifiedMailRow } from '$lib/stores/mailQueue.svelte.js';
	import { toastStore } from '$lib/stores/toast.svelte.js';

	const NOTE_MAX = 500;
	type MarkerKey = 'zu-weit' | 'zu-klein';

	let {
		row,
		stripeState,
		onApply,
		saving = false,
		saveError = null,
		councilRegistered = true
	}: {
		row: UnifiedMailRow;
		stripeState: 'still' | 'ne' | 'ne-strong' | undefined;
		onApply: (
			dom: DomainKey,
			act: ActionabilityKey,
			note: string | null,
			markers: MarkerKey[]
		) => Promise<void>;
		saving?: boolean;
		saveError?: string | null;
		// Whether the active vault registers Council. Gates the "→ Übernommen" action
		// (council ingest) — demo does not register Council, so the action is removed.
		councilRegistered?: boolean;
	} = $props();

	const hasCorrection = $derived(row.correction?.corrected_domain != null);

	const currentDomain = $derived<DomainKey>(
		((row.correction?.corrected_domain as DomainKey | undefined) ??
			(row.domain as DomainKey | undefined) ??
			'unsorted')
	);
	// 2026-06-08 Bauteil 2.7: effective_actionability first — Reader macht
	// latest-wins ueber Override + Correction (parseTs-Vergleich). Vorher
	// hatte correction.corrected_actionability fixe Prioritaet, das
	// uebersteuerte spaetere Override-Klicks → Button-Highlight + Stumm-Grund-
	// Chips zeigten falschen Zustand.
	const currentActionability = $derived<ActionabilityKey>(
		((row.effective_actionability as ActionabilityKey | undefined) ??
			(row.correction?.corrected_actionability as ActionabilityKey | undefined) ??
			(row.actionability as ActionabilityKey | undefined) ??
			'actionable')
	);

	// Marker-Aggregation: CSV in correction.correction_marker → string[]
	const activeMarkers = $derived<MarkerKey[]>(
		(row.correction?.correction_marker?.split(',').filter(Boolean) ?? []) as MarkerKey[]
	);

	// 2026-05-28 Aufräum-Iteration Bug 2: noteInput pro Mail (row.uid) reset + saved-note restore.
	// Vorher: `let noteInput = $state('')` — Component-Local, kein Reset bei Props-Wechsel
	// → A's Notiz leakte in B-Verdict-Stage. Fix: $effect resync auf uid-change (läuft auch
	// initial → setzt saved-note beim ersten Mount).
	let noteInput = $state('');
	let lastUid: string | null = $state(null);
	$effect(() => {
		if (row.uid !== lastUid) {
			noteInput = row.correction?.note ?? '';
			lastUid = row.uid;
		}
	});

	// allMissing-Edge-Case: voices alle missing → keine Klassifikation bisher.
	const allMissing = $derived(
		!row.voices || row.voices.length === 0 || row.voices.every((v) => v.kind === 'missing')
	);

	// Eyebrow per stripe-state
	const eyebrowText = $derived(
		allMissing
			? 'NOCH NICHT KLASSIFIZIERT'
			: stripeState === 'still'
				? 'MEIN URTEIL · ALLE EINIG'
				: stripeState === 'ne'
					? 'MEIN URTEIL · 3 VON 4 SAGEN MIR DAS GLEICHE'
					: 'MEIN URTEIL · STIMMEN UNEINIG'
	);
	const isDiscussed = $derived(stripeState === 'ne' || stripeState === 'ne-strong');

	function pickDomain(d: DomainKey) {
		if (saving) return;
		void onApply(d, currentActionability, noteInput.trim() || null, activeMarkers);
	}
	function pickAction(a: ActionabilityKey) {
		if (saving) return;
		// Bei Wechsel zu non-archive-silent: Marker-Set leeren (semantisch nicht mehr relevant).
		const nextMarkers = a === 'archive-silent' ? activeMarkers : [];
		void onApply(currentDomain, a, noteInput.trim() || null, nextMarkers);
	}
	function toggleMarker(m: MarkerKey) {
		if (saving) return;
		const next = activeMarkers.includes(m)
			? activeMarkers.filter((x) => x !== m)
			: [...activeMarkers, m];
		void onApply(currentDomain, currentActionability, noteInput.trim() || null, next);
	}
	function saveNoteBlur() {
		// 2026-05-28 Aufräum-Iteration Bug 2: auto-save als safety-net wenn User
		// die Mail wechselt ohne Speichern-Button. Vorher: `if (!trimmed) return`
		// — verhinderte das LÖSCHEN einer gespeicherten Notiz durch Leerung.
		const trimmed = noteInput.trim();
		const saved = row.correction?.note ?? '';
		if (trimmed === saved) return; // No-Op (auch leer == leer)
		void onApply(currentDomain, currentActionability, trimmed || null, activeMarkers);
	}
	// 2026-06-06 Bauteil 2 (Mail-zu-Council-Uebergang): „→ Übernommen"-Button
	// schreibt in mail_actionability_override (separater Endpoint) statt in
	// corrections. Semantik: nicht „Klassifikation falsch", sondern „in
	// Council ingestieren". invalidateAll löst den Mail-Queue-Reload aus →
	// effective_actionability wird im Loader vom Override geliefert.
	let overridePending = $state(false);
	let overrideError = $state<string | null>(null);
	async function pickUebernommen() {
		if (overridePending || saving) return;
		const feedbackId = parseInt(row.uid, 10);
		if (!Number.isFinite(feedbackId)) {
			overrideError = 'Mail-ID nicht gefunden (mock-row?)';
			return;
		}
		overridePending = true;
		overrideError = null;
		try {
			const res = await fetch('/api/mail/override', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					feedback_id: feedbackId,
					overridden_actionability: 'uebernommen'
				})
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			await invalidateAll();
			toastStore.show('→ Übernommen', 2000);
		} catch (e) {
			overrideError = (e as Error).message;
		} finally {
			overridePending = false;
		}
	}

	function saveNoteExplicit() {
		// 2026-05-28 Aufräum-Iteration Bug 2: expliziter Save-Button. Gleiche Logik
		// wie saveNoteBlur, separate Funktion damit Disable-Condition im Markup
		// auf den gleichen Vergleich aufsetzen kann.
		const trimmed = noteInput.trim();
		const saved = row.correction?.note ?? '';
		if (trimmed === saved) return;
		void onApply(currentDomain, currentActionability, trimmed || null, activeMarkers);
	}
</script>

<section class="verdict-stage" class:discussed={isDiscussed}>
	<!-- Eyebrow -->
	<div class="eyebrow" class:eyebrow-ember={isDiscussed}>{eyebrowText}</div>

	{#if !allMissing}
		<!-- Domain-Pills: alle 8, 1 selected schwarz, rest outline-dashed -->
		<div class="pills">
			{#each DOMAIN_KEYS as d}
				{@const active = currentDomain === d}
				{@const cls = DOMAIN_CLASS[d]}
				<button
					type="button"
					class="pill"
					class:pill-user={active}
					class:pill-outline={!active}
					disabled={saving}
					onclick={() => pickDomain(d)}
				>
					<span class="pill-dot {active ? '' : cls.dot}"></span>
					{DOMAIN_LABELS[d]}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Action-Buttons: 3 (Aktionable + → Übernommen + Archiv stumm).
	     'archive' (time-decay) bleibt nicht user-setzbar, „→ Übernommen"
	     ruft separaten Override-Endpoint (semantisch ≠ correction). -->
	<div class="actions">
		<button
			type="button"
			class="action-btn"
			class:action-active={currentActionability === 'actionable'}
			disabled={saving || overridePending}
			onclick={() => pickAction('actionable')}
		>Aktionable</button>
		{#if currentDomain === 'immo' && councilRegistered}
			<!-- "→ Übernommen" = Council ingest (data effect). Only when the active vault
			     registers Council — demo does not (Aufgabe 4b), so no dead action. -->
			<button
				type="button"
				class="action-btn action-uebernommen"
				class:action-active={currentActionability === 'uebernommen'}
				disabled={saving || overridePending}
				onclick={pickUebernommen}
			>→ Übernommen</button>
		{/if}
		<button
			type="button"
			class="action-btn action-solid"
			class:action-active={currentActionability === 'archive-silent'}
			disabled={saving || overridePending}
			onclick={() => pickAction('archive-silent')}
		>⏷ Archiv (stumm)</button>
	</div>
	{#if overrideError}
		<div class="override-error">Fehler: {overrideError}</div>
	{/if}

	<!-- Stumm-Grund-Chips: nur sichtbar bei archive-silent. Multiselect. -->
	{#if currentActionability === 'archive-silent'}
		<div class="mute-row">
			<span class="mute-label">Stumm-Grund</span>
			<button
				type="button"
				class="chip"
				class:chip-active={activeMarkers.includes('zu-weit')}
				disabled={saving}
				onclick={() => toggleMarker('zu-weit')}
			>📏 zu weit</button>
			<button
				type="button"
				class="chip"
				class:chip-active={activeMarkers.includes('zu-klein')}
				disabled={saving}
				onclick={() => toggleMarker('zu-klein')}
			>📐 zu klein</button>
		</div>
	{/if}

	<!-- Notiz: expliziter Save-Button + onblur auto-save als safety-net (Bug 2 fix 2026-05-28) -->
	<div class="note-wrap">
		<textarea
			bind:value={noteInput}
			onblur={saveNoteBlur}
			placeholder="Notiz hinzufügen…"
			maxlength={NOTE_MAX}
			rows="1"
			disabled={saving}
			class="note-input"
		></textarea>
		<span class="note-count">{noteInput.length}/{NOTE_MAX}</span>
		<button
			type="button"
			class="note-save"
			disabled={saving || noteInput.trim() === (row.correction?.note ?? '')}
			onclick={saveNoteExplicit}
		>Speichern</button>
	</div>

	{#if saveError}
		<div class="save-error">{saveError}</div>
	{:else if hasCorrection}
		<div class="save-hint">↻ korrigiert</div>
	{/if}
</section>

<style>
	.verdict-stage {
		background: white;
		padding: 18px 16px;
		border-bottom: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.verdict-stage.discussed {
		border-top: 4px solid hsl(28 80% 70%);
	}
	.eyebrow {
		font-family: var(--font-mono);
		font-size: 10.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
		font-weight: 500;
	}
	.eyebrow-ember {
		color: hsl(28 80% 38%);
	}

	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 12.5px;
		font-family: var(--font-mono);
		font-weight: 500;
		cursor: pointer;
		transition: opacity 120ms;
	}
	.pill:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.pill-user {
		background: hsl(222 47% 11%);
		color: hsl(210 40% 98%);
		border: 1px solid hsl(222 47% 11%);
	}
	.pill-user .pill-dot {
		background: hsl(32 100% 60%);
	}
	.pill-outline {
		background: transparent;
		border: 1px dashed var(--color-border);
		color: var(--color-muted-foreground);
		font-style: italic;
	}
	.pill-outline .pill-dot {
		opacity: 0.5;
	}
	.pill-dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		display: inline-block;
		flex-shrink: 0;
	}

	.actions {
		display: flex;
		gap: 8px;
	}
	.action-btn {
		padding: 6px 14px;
		border-radius: var(--radius-md, 6px);
		font-size: 12.5px;
		font-weight: 500;
		cursor: pointer;
		background: white;
		color: var(--color-muted-foreground);
		border: 1px solid var(--color-border);
		transition: background 120ms, color 120ms, border-color 120ms;
	}
	.action-btn:hover:not(:disabled):not(.action-active) {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.action-solid.action-active {
		background: hsl(222 47% 11%);
		color: hsl(210 40% 98%);
		border-color: hsl(222 47% 11%);
	}
	.action-btn.action-active:not(.action-solid):not(.action-uebernommen) {
		background: var(--color-foreground);
		color: var(--color-background);
		border-color: var(--color-foreground);
	}
	/* 2026-06-06 Bauteil 2: „→ Übernommen"-Button mit eigener Verdict-
	   Farbe (kaufen-green analog Kampagne-Pille), abgegrenzt von Aktionable
	   und Archiv. */
	.action-uebernommen.action-active {
		background: var(--verdict-kaufen-bg, hsl(142 50% 92%));
		color: var(--verdict-kaufen-fg, hsl(142 65% 22%));
		border-color: var(--verdict-kaufen-bd, hsl(142 40% 75%));
	}
	.override-error {
		font-size: 11px;
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
		margin-top: 4px;
	}

	.mute-row {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		font-family: var(--font-mono);
		color: var(--color-muted-foreground);
	}
	.mute-label {
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 9px;
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: 11px;
		background: white;
		border: 1px solid var(--color-border);
		color: var(--color-muted-foreground);
		cursor: pointer;
		transition: background 120ms, color 120ms;
	}
	.chip:hover:not(:disabled):not(.chip-active) {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.chip:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.chip-active {
		background: hsl(222 47% 11%);
		color: hsl(210 40% 98%);
		border-color: hsl(222 47% 11%);
	}

	.note-wrap {
		position: relative;
		padding: 10px 12px 28px 12px; /* extra bottom space for count + save row */
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md, 6px);
	}
	.note-input {
		width: 100%;
		border: none;
		background: transparent;
		color: var(--color-foreground);
		font-size: 12px;
		font-family: inherit;
		resize: none;
		outline: none;
		min-height: 1.5em;
	}
	.note-input::placeholder {
		color: var(--color-muted-foreground);
		font-family: var(--font-mono);
		font-size: 10.5px;
	}
	.note-count {
		position: absolute;
		bottom: 8px;
		left: 12px;
		font-family: var(--font-mono);
		font-size: 9.5px;
		color: var(--color-muted-foreground);
	}
	.note-save {
		position: absolute;
		bottom: 5px;
		right: 8px;
		padding: 2px 10px;
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 500;
		background: hsl(222 47% 11%);
		color: hsl(210 40% 98%);
		border: 1px solid hsl(222 47% 11%);
		border-radius: var(--radius-md, 6px);
		cursor: pointer;
		transition: opacity 120ms;
	}
	.note-save:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.note-save:hover:not(:disabled) {
		opacity: 0.85;
	}

	.save-error {
		font-size: 11px;
		color: hsl(0 70% 50%);
	}
	.save-hint {
		font-size: 10.5px;
		font-family: var(--font-mono);
		color: var(--color-muted-foreground);
	}
</style>
