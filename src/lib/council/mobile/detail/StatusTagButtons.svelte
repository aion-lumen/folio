<!--
  Mobile 1d (2026-05-30): drei Status-Tag-Buttons (Kaufen/Beobachten/Verwerfen).
  Optimistic-UI: lokaler State wechselt sofort, POST async, bei Fehler revert.

  2026-06-08 Bauteil 2.7d Regression-Fix: Verwerfen-Klick war picker-only
  geworden (kein direkter Pfad ohne grund-auswahl). Jetzt:
    - Verwerfen-Button direkt klickbar → status='verworfen', kein reason
    - Quick-Reason-Zeile darunter (immer sichtbar) — 'zu weit' / 'zu klein'
      → status='verworfen' + reason in einem Klick
    - 'Abbrechen' entfaellt (Picker existiert nicht mehr)
    - Notiz-Feld (NoteEditor) bleibt als freie Grund-Eingabe
-->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	type Tag = 'kaufen' | 'beobachten' | 'verworfen';
	type VerworfenReason = 'zu weit' | 'zu klein';

	let {
		objectId,
		current,
		currentReason = null
	}: {
		objectId: string;
		current: string;
		currentReason?: string | null;
	} = $props();

	let localState = $state<string>(current);
	let localReason = $state<string | null>(currentReason);
	let pending = $state(false);
	let error = $state<string | null>(null);

	// Wenn loader-state sich ändert (z.B. nach Konsens-Trigger reload),
	// localState + localReason anpassen — aber nur wenn nichts pending.
	$effect(() => {
		if (!pending) {
			localState = current;
			localReason = currentReason;
		}
	});

	async function postStatus(tag: Tag, reason: VerworfenReason | null = null) {
		if (pending) return;
		const previous = localState;
		const previousReason = localReason;
		localState = tag;
		// localReason mit-aktualisieren damit Quick-Button sofort optisch
		// active wird (statt erst nach invalidateAll). tag != 'verworfen'
		// → reason wird konzeptionell null (override mit anderem status).
		localReason = tag === 'verworfen' ? reason : null;
		pending = true;
		error = null;
		try {
			const res = await fetch(`/api/council/${objectId}/status`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(
					reason ? { status_tag: tag, reason } : { status_tag: tag }
				)
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `HTTP ${res.status}`);
			}
			await invalidateAll();
		} catch (e) {
			localState = previous;
			localReason = previousReason;
			error = (e as Error).message;
		} finally {
			pending = false;
		}
	}
</script>

<div class="tags">
	<button
		type="button"
		class="t k"
		class:active={localState === 'kaufen'}
		disabled={pending}
		onclick={() => postStatus('kaufen')}
	>
		Kaufen
	</button>
	<button
		type="button"
		class="t b"
		class:active={localState === 'beobachten'}
		disabled={pending}
		onclick={() => postStatus('beobachten')}
	>
		Beobachten
	</button>
	<button
		type="button"
		class="t v"
		class:active={localState === 'verworfen'}
		disabled={pending}
		onclick={() => postStatus('verworfen')}
	>
		Verwerfen
	</button>
</div>

<!-- Quick-Reason-Zeile: convenience-pfade für häufigste verwerfen-gründe.
     POST setzt status='verworfen' + reason in einem klick. Aktiver Button
     wird hervorgehoben wenn das objekt mit diesem grund verworfen wurde
     (im nachhinein sichtbar, welcher grund). -->
<div class="quick-reasons" role="group" aria-label="Verwerfen mit Grund">
	<span class="qr-label">verwerfen mit Grund:</span>
	<button
		type="button"
		class="qr"
		class:active={localState === 'verworfen' && localReason === 'zu weit'}
		disabled={pending}
		onclick={() => postStatus('verworfen', 'zu weit')}
	>
		zu weit
	</button>
	<button
		type="button"
		class="qr"
		class:active={localState === 'verworfen' && localReason === 'zu klein'}
		disabled={pending}
		onclick={() => postStatus('verworfen', 'zu klein')}
	>
		zu klein
	</button>
</div>

{#if error}
	<div class="err">Fehler: {error}</div>
{/if}

<style>
	.tags {
		display: flex;
		gap: 6px;
		margin-top: 8px;
	}
	.t {
		flex: 1;
		text-align: center;
		padding: 8px 0;
		border-radius: 6px;
		font-size: 11.5px;
		font-weight: 500;
		font-family: var(--font-mono);
		border: 1px solid;
		background: white;
		color: var(--wf-muted, hsl(215 16% 50%));
		border-color: var(--wf-line, hsl(214 20% 88%));
		cursor: pointer;
		transition: background-color 100ms, color 100ms;
	}
	.t:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.t.k.active {
		background: var(--verdict-kaufen-bg, hsl(142 50% 95%));
		color: var(--verdict-kaufen-fg, hsl(142 65% 25%));
		border-color: var(--verdict-kaufen-bd, hsl(142 40% 80%));
	}
	.t.b.active {
		background: var(--verdict-beobachten-bg, hsl(32 90% 95%));
		color: var(--verdict-beobachten-fg, hsl(32 80% 32%));
		border-color: var(--verdict-beobachten-bd, hsl(32 80% 78%));
	}
	.t.v.active {
		background: var(--verdict-verwerfen-bg, hsl(0 70% 96%));
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
		border-color: var(--verdict-verwerfen-bd, hsl(0 60% 84%));
	}
	.quick-reasons {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
	}
	.qr-label {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--wf-muted, hsl(215 16% 50%));
		margin-right: 2px;
	}
	.qr {
		padding: 4px 10px;
		border-radius: 5px;
		font-size: 10.5px;
		font-family: var(--font-mono);
		border: 1px dashed var(--verdict-verwerfen-bd, hsl(0 60% 84%));
		background: transparent;
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
		cursor: pointer;
	}
	.qr:hover:not(:disabled) {
		background: var(--verdict-verwerfen-bg, hsl(0 70% 96%));
	}
	.qr.active {
		background: var(--verdict-verwerfen-bg, hsl(0 70% 96%));
		border-style: solid;
		font-weight: 500;
	}
	.qr:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.qr.active:disabled {
		opacity: 1; /* aktiv-zustand sichtbar bleibt auch wenn pending */
	}
	.err {
		margin-top: 6px;
		font-size: 11px;
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
	}
</style>
