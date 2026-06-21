<!--
  2026-06-08 Bauteil 2.7c: HauskaufCard — Visual-Mimikry der LIFE-
  ObjectiveCard fuer Hauskauf-Workflow. Eigene Komponente weil Props
  strukturell anders sind (Workflow ≠ Objective).

  Karten-Anatomie:
    - ID-Zeile (mono, muted)
    - Titel (Adresse oder fallback)
    - Tags-Zeile (portal · tags)
    - Chip-Zeile: Listenpreis (immer) + Termin (in_arbeit) + VHB (erledigt)
    - Block-Grund-Chip (rot) bei status='blockiert', Inhalt aus notes
    - Verdikt-Tag (✓/✗) oben rechts bei status='erledigt'

  Inline-Edit fuer Termin + VHB:
    - Klick auf Chip → Input ersetzt Chip
    - Enter/Blur → POST /api/kampagne (append-only)
    - Escape → cancel

  Auto-Status-Uebergaenge (client-side pre-POST):
    - status=offen + termin gesetzt → status=in_arbeit
    - status=in_arbeit + verhandlungspreis gesetzt + termin in
      Vergangenheit → status=erledigt
-->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toastStore } from '$lib/stores/toast.svelte.js';
	import type {
		HauskaufWorkflowRow,
		HauskaufStatus,
		HauskaufVerdict
	} from '$lib/server/folio-db/types.js';
	import type { CouncilObjectRow } from '$lib/server/council-db/types.js';
	import type { MailLink } from './types.js';

	let {
		workflow,
		object,
		mailLinks: _mailLinks
	}: {
		workflow: HauskaufWorkflowRow;
		object: CouncilObjectRow | null;
		mailLinks: MailLink[];
	} = $props();

	const cardId = $derived(`obj-${workflow.council_object_id.slice(0, 8)}`);
	const titleText = $derived(
		object?.address ?? object?.title ?? workflow.council_object_id.slice(0, 12)
	);
	const tagsLine = $derived.by(() => {
		const parts: string[] = [];
		if (object?.portal) parts.push(object.portal);
		// Future: object.tags wenn Schema das liefert
		return parts.join(' · ');
	});

	function fmtPriceM(v: number | null): string {
		if (v == null) return '';
		const m = v / 1_000_000;
		if (m >= 1) return `${m.toFixed(2)} M`;
		const k = v / 1000;
		if (k >= 10) return `${k.toFixed(0)} k`;
		return v.toLocaleString('de-CH');
	}
	function fmtDate(iso: string | null): string {
		if (!iso) return '';
		try {
			const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
			return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' });
		} catch {
			return iso.slice(0, 10);
		}
	}

	// === Tolerante Parser ===
	// Termin: '3.6.', '3.6 14:00', '03.06.2026 14:00', '2026-06-03' → ISO date
	function parseTermin(input: string): string | null {
		const s = input.trim();
		if (!s) return null;
		// ISO direkt
		if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
		// DD.MM[.YYYY] [HH:MM]
		const m = s.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?\s*(?:(\d{1,2}):(\d{2}))?$/);
		if (!m) return null;
		const dd = m[1].padStart(2, '0');
		const mm = m[2].padStart(2, '0');
		const yyyy = m[3] ?? String(new Date().getFullYear());
		if (m[4] && m[5]) {
			const hh = m[4].padStart(2, '0');
			const mi = m[5].padStart(2, '0');
			return `${yyyy}-${mm}-${dd}T${hh}:${mi}:00`;
		}
		return `${yyyy}-${mm}-${dd}`;
	}
	// VHB: '1.32 M', '1320000', '1.32m', '1.32', '850k' → number EUR
	function parseVHB(input: string): number | null {
		const s = input.trim().toLowerCase().replace(/[,\s]/g, (c) => (c === ',' ? '.' : ''));
		if (!s) return null;
		const m = s.match(/^([\d.]+)\s*([mk]?)$/);
		if (!m) return null;
		const n = parseFloat(m[1]);
		if (!Number.isFinite(n) || n <= 0) return null;
		if (m[2] === 'm') return Math.round(n * 1_000_000);
		if (m[2] === 'k') return Math.round(n * 1_000);
		// Heuristik: < 100 → Millionen-Schreibweise (1.32 = 1.32 M)
		if (n < 100) return Math.round(n * 1_000_000);
		return Math.round(n);
	}

	// === Inline-Edit State ===
	let editing = $state<'termin' | 'vhb' | null>(null);
	let inputValue = $state('');
	let saving = $state(false);
	let saveError = $state<string | null>(null);

	function startEdit(field: 'termin' | 'vhb') {
		editing = field;
		saveError = null;
		if (field === 'termin') {
			inputValue = workflow.termin ? fmtDate(workflow.termin) : '';
		} else {
			inputValue = workflow.verhandlungspreis != null
				? String(workflow.verhandlungspreis / 1_000_000)
				: '';
		}
		// Focus nach DOM-update
		setTimeout(() => {
			const el = document.querySelector(`[data-card-id="${cardId}"] input.inline-edit`) as HTMLInputElement | null;
			el?.focus();
			el?.select();
		}, 0);
	}
	function cancelEdit() {
		editing = null;
		inputValue = '';
		saveError = null;
	}
	async function commitEdit() {
		if (!editing || saving) return;
		const field = editing;
		const raw = inputValue;
		// Parsen
		let nextTermin: string | null = workflow.termin;
		let nextVHB: number | null = workflow.verhandlungspreis;
		if (field === 'termin') {
			if (!raw.trim()) {
				saveError = 'leer';
				return;
			}
			const parsed = parseTermin(raw);
			if (!parsed) {
				saveError = 'ungueltiges Datum';
				return;
			}
			nextTermin = parsed;
		} else {
			if (!raw.trim()) {
				saveError = 'leer';
				return;
			}
			const parsed = parseVHB(raw);
			if (parsed == null) {
				saveError = 'ungueltiger Preis';
				return;
			}
			nextVHB = parsed;
		}
		// Auto-Status-Uebergang
		let nextStatus: HauskaufStatus = workflow.status;
		if (workflow.status === 'offen' && nextTermin) {
			nextStatus = 'in_arbeit';
		} else if (workflow.status === 'in_arbeit' && nextVHB != null && nextTermin) {
			const terminDate = new Date(nextTermin.includes('T') ? nextTermin : nextTermin + 'T00:00:00');
			if (terminDate.getTime() < Date.now()) nextStatus = 'erledigt';
		}
		await postWorkflow({
			status: nextStatus,
			termin: nextTermin,
			verhandlungspreis: nextVHB,
			notes: workflow.notes,
			verdict: workflow.verdict
		});
	}

	// === Verdikt-Tag ===
	async function toggleVerdict(to: HauskaufVerdict) {
		if (saving) return;
		const next: HauskaufVerdict | null = workflow.verdict === to ? null : to;
		await postWorkflow({
			status: workflow.status,
			termin: workflow.termin,
			verhandlungspreis: workflow.verhandlungspreis,
			notes: workflow.notes,
			verdict: next
		});
	}

	async function postWorkflow(payload: {
		status: HauskaufStatus;
		termin: string | null;
		verhandlungspreis: number | null;
		notes: string | null;
		verdict: HauskaufVerdict | null;
	}): Promise<void> {
		saving = true;
		saveError = null;
		try {
			const res = await fetch('/api/kampagne', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					council_object_id: workflow.council_object_id,
					...payload
				})
			});
			if (!res.ok) {
				const text = await res.text().catch(() => res.statusText);
				saveError = `HTTP ${res.status}: ${text.slice(0, 120)}`;
				return;
			}
			editing = null;
			inputValue = '';
			await invalidateAll();
			if (payload.status !== workflow.status) {
				toastStore.show(`Status: ${payload.status}`, 1500);
			}
		} catch (e) {
			saveError = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	function onInputKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void commitEdit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEdit();
		}
	}
</script>

<article class="hk-card" data-card-id={cardId}>
	<div class="hk-head">
		<span class="hk-id">{cardId}</span>
		{#if workflow.status === 'erledigt'}
			<div class="hk-verdict">
				<button
					type="button"
					class="v-btn"
					class:active={workflow.verdict === 'favorisiert'}
					title="Favorisiert"
					disabled={saving}
					onclick={() => toggleVerdict('favorisiert')}>✓</button>
				<button
					type="button"
					class="v-btn"
					class:active={workflow.verdict === 'verworfen'}
					title="Verworfen"
					disabled={saving}
					onclick={() => toggleVerdict('verworfen')}>✗</button>
			</div>
		{/if}
	</div>

	<div class="hk-title" title={titleText}>{titleText}</div>

	{#if tagsLine}
		<div class="hk-tags">{tagsLine}</div>
	{/if}

	<div class="hk-chips">
		{#if object?.price_value != null}
			<span class="chip chip-list">{fmtPriceM(object.price_value)}</span>
		{/if}
		{#if editing === 'termin'}
			<span class="chip chip-edit">
				<input
					class="inline-edit"
					type="text"
					placeholder="3.6. oder 03.06.2026"
					bind:value={inputValue}
					onkeydown={onInputKey}
					onblur={commitEdit}
					disabled={saving}
				/>
			</span>
		{:else if workflow.termin}
			<button type="button" class="chip chip-termin" onclick={() => startEdit('termin')}>
				{fmtDate(workflow.termin)}
			</button>
		{:else}
			<button type="button" class="chip chip-empty" onclick={() => startEdit('termin')}>
				+ Termin
			</button>
		{/if}

		{#if editing === 'vhb'}
			<span class="chip chip-edit">
				<input
					class="inline-edit"
					type="text"
					placeholder="1.32 M oder 1320000"
					bind:value={inputValue}
					onkeydown={onInputKey}
					onblur={commitEdit}
					disabled={saving}
				/>
			</span>
		{:else if workflow.verhandlungspreis != null}
			<button type="button" class="chip chip-vhb" onclick={() => startEdit('vhb')}>
				VHB {fmtPriceM(workflow.verhandlungspreis)}
			</button>
		{:else}
			<button type="button" class="chip chip-empty" onclick={() => startEdit('vhb')}>
				+ VHB
			</button>
		{/if}
	</div>

	{#if workflow.status === 'blockiert' && workflow.notes}
		<div class="hk-block-grund">{workflow.notes}</div>
	{/if}

	{#if saveError}
		<div class="hk-err">{saveError}</div>
	{/if}
</article>

<style>
	.hk-card {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 10px;
		background: white;
		border: 1px solid hsl(214 25% 90%);
		border-radius: 8px;
		box-shadow: 0 1px 1px rgb(0 0 0 / 0.03);
		font-size: 11.5px;
	}
	.hk-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 6px;
	}
	.hk-id {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 9.5px;
		color: hsl(215 16% 55%);
		letter-spacing: 0.02em;
	}
	.hk-verdict {
		display: flex;
		gap: 2px;
	}
	.v-btn {
		background: transparent;
		border: 1px solid hsl(214 25% 85%);
		border-radius: 4px;
		width: 18px;
		height: 18px;
		padding: 0;
		font-size: 10px;
		line-height: 1;
		color: hsl(215 16% 55%);
		cursor: pointer;
		font-family: inherit;
	}
	.v-btn:hover {
		border-color: hsl(215 16% 45%);
		color: hsl(222 47% 25%);
	}
	.v-btn.active {
		border-color: hsl(222 47% 25%);
		background: hsl(222 47% 11%);
		color: white;
	}
	.hk-title {
		font-size: 12.5px;
		font-weight: 500;
		color: hsl(222 47% 11%);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hk-tags {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 9.5px;
		color: hsl(215 16% 55%);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hk-chips {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
		margin-top: 2px;
	}
	.chip {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 4px;
		border: 1px solid transparent;
		cursor: pointer;
		font-family: inherit;
		line-height: 1.4;
	}
	.chip-list {
		background: hsl(214 28% 95%);
		color: hsl(215 16% 35%);
		cursor: default;
	}
	.chip-termin {
		background: hsl(28 95% 95%);
		color: hsl(22 90% 32%);
		border-color: hsl(28 60% 80%);
	}
	.chip-vhb {
		background: hsl(142 45% 95%);
		color: hsl(142 64% 28%);
		border-color: hsl(142 50% 78%);
	}
	.chip-empty {
		background: transparent;
		color: hsl(215 16% 55%);
		border: 1px dashed hsl(214 25% 78%);
	}
	.chip-empty:hover {
		color: hsl(222 47% 25%);
		border-color: hsl(215 16% 45%);
	}
	.chip-edit {
		background: white;
		border: 1px solid hsl(217 80% 55%);
		padding: 0 4px;
	}
	.inline-edit {
		font: inherit;
		border: 0;
		outline: 0;
		background: transparent;
		min-width: 80px;
		padding: 0;
	}
	button.chip {
		font-family: inherit;
	}
	.hk-block-grund {
		background: hsl(0 75% 96%);
		color: hsl(0 65% 38%);
		border: 1px solid hsl(0 50% 85%);
		border-radius: 4px;
		padding: 3px 6px;
		font-size: 10.5px;
		margin-top: 2px;
	}
	.hk-err {
		font-size: 10px;
		color: hsl(0 65% 38%);
		font-family: ui-monospace, SF Mono, monospace;
	}
</style>
