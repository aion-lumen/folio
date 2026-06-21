<!--
  Mobile 1d (2026-05-30): Top-10-Picker für die Detail-Ansicht.
  Aktuelle Position anzeigen + inline picker mit 11 Slots (1..10 + Entfernen).
  Verdrängungs-Logik client-side: 11. Aufnahme verdrängt das niedrigste auf rank=0.
  Optimistic: lokaler State sofort, batch-POST async, revert-on-error.
-->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let {
		objectId,
		currentRank,
		topRanks
	}: {
		objectId: string;
		currentRank: number | null;
		topRanks: Record<string, number>; // map<other_object_id, rank>
	} = $props();

	let openPicker = $state(false);
	let localRank = $state<number | null>(currentRank);
	let pending = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!pending) localRank = currentRank;
	});

	function buildBatch(newRank: number): Array<{ object_id: string; rank: number }> {
		// newRank: 0 = entfernen, 1..10 = neue position
		// Berechne, welche objekte sich bewegen (inklusive verdrängung).
		// Wir konstruieren die neue Top-10 in-memory + diffen gegen alte ranks.

		// 1. baue current-list ohne self (rank ASC)
		const currentList = Object.entries(topRanks)
			.filter(([oid]) => oid !== objectId)
			.map(([oid, rank]) => ({ object_id: oid, rank }))
			.sort((a, b) => a.rank - b.rank);

		// 2. wenn entfernen: self → rank=0, rest behält ranks (keine compaction nötig
		//    weil Reader filtert rank=0 raus; gaps in 1..10 sind ok)
		if (newRank === 0) {
			if (localRank == null) return []; // war nicht drin, nichts zu tun
			return [{ object_id: objectId, rank: 0 }];
		}

		// 3. wenn hinzufügen/verschieben: konstruiere zielreihenfolge
		//    - alle current-objects mit rank < newRank bleiben
		//    - self landet bei rank=newRank
		//    - alle current-objects mit rank >= newRank rutschen +1
		//    - das 11. fällt mit rank=0 raus
		const newList: Array<{ object_id: string; rank: number }> = [];
		let inserted = false;
		for (const item of currentList) {
			const targetRank = item.rank >= newRank ? item.rank + 1 : item.rank;
			if (!inserted && targetRank > newRank) {
				newList.push({ object_id: objectId, rank: newRank });
				inserted = true;
			}
			newList.push({ object_id: item.object_id, rank: targetRank });
		}
		if (!inserted) {
			newList.push({ object_id: objectId, rank: newRank });
		}

		// 4. diff: nur objekte deren rank sich tatsächlich ändert in den batch
		const oldRanks = new Map<string, number>([
			...Object.entries(topRanks).map(([oid, r]) => [oid, r] as [string, number])
		]);
		if (localRank != null) oldRanks.set(objectId, localRank);

		const batch: Array<{ object_id: string; rank: number }> = [];
		for (const item of newList) {
			if (item.rank > 10) {
				// verdrängt
				batch.push({ object_id: item.object_id, rank: 0 });
			} else {
				const prev = oldRanks.get(item.object_id) ?? null;
				if (prev !== item.rank) batch.push(item);
			}
		}
		return batch;
	}

	async function pick(newRank: number) {
		if (pending) return;
		openPicker = false;
		const previous = localRank;
		const batch = buildBatch(newRank);
		if (batch.length === 0) return;
		localRank = newRank === 0 ? null : newRank;
		pending = true;
		error = null;
		try {
			const res = await fetch('/api/council/me/rankings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ batch })
			});
			if (!res.ok) {
				const t = await res.text();
				throw new Error(t || `HTTP ${res.status}`);
			}
			await invalidateAll();
		} catch (e) {
			localRank = previous;
			error = (e as Error).message;
		} finally {
			pending = false;
		}
	}
</script>

<div class="picker">
	<button
		type="button"
		class="current"
		onclick={() => (openPicker = !openPicker)}
		disabled={pending}
	>
		<span class="lbl">Meine Top-10:</span>
		<span class="val">{localRank ? `#${localRank}` : 'nicht drin'}</span>
		<span class="chev">{openPicker ? '▴' : '▾'}</span>
	</button>

	{#if openPicker}
		<div class="grid">
			{#each Array.from({ length: 10 }, (_, i) => i + 1) as r (r)}
				<button
					type="button"
					class="slot"
					class:active={localRank === r}
					onclick={() => pick(r)}
					disabled={pending}
				>
					#{r}
				</button>
			{/each}
			<button
				type="button"
				class="slot remove"
				class:active={localRank == null}
				onclick={() => pick(0)}
				disabled={pending || localRank == null}
			>
				✕ Entfernen
			</button>
		</div>
	{/if}

	{#if error}
		<div class="err">{error}</div>
	{/if}
</div>

<style>
	.picker {
		margin-top: 8px;
	}
	.current {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		background: var(--wf-bg, hsl(210 25% 98.5%));
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
		border-radius: 6px;
		font-size: 11.5px;
		color: var(--wf-fg, hsl(222 30% 22%));
		cursor: pointer;
		font-family: inherit;
		text-align: left;
	}
	.current:disabled {
		opacity: 0.7;
		cursor: wait;
	}
	.lbl {
		flex-shrink: 0;
	}
	.val {
		font-family: var(--font-mono);
		font-size: 11.5px;
		font-weight: 500;
		margin-left: auto;
	}
	.chev {
		color: var(--wf-muted, hsl(215 16% 50%));
		font-size: 10px;
	}
	.grid {
		margin-top: 6px;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 4px;
	}
	.slot {
		padding: 8px 0;
		font-family: var(--font-mono);
		font-size: 11px;
		background: white;
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
		border-radius: 4px;
		cursor: pointer;
		color: var(--wf-fg, hsl(222 30% 22%));
	}
	.slot.active {
		background: hsl(222 47% 11%);
		color: white;
		border-color: hsl(222 47% 11%);
	}
	.slot.remove {
		grid-column: span 5;
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
	}
	.slot.remove.active {
		background: var(--verdict-verwerfen-bg, hsl(0 70% 96%));
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
		border-color: var(--verdict-verwerfen-bd, hsl(0 60% 84%));
	}
	.slot:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.err {
		margin-top: 6px;
		font-size: 11px;
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
	}
</style>
