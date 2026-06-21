<!--
  2026-06-07 CampaignTrack: permanent sichtbarer Kampagnen-Block
  unterhalb des Datenflusses. 3 Spalten (Offen/Terminiert/Besichtigt)
  mit hauskauf_workflow-Karten. Leerer Zustand pro Spalte: schlichtes
  „—".
-->
<script lang="ts">
	import type { PipelinePageData } from './types.js';

	let { workflows }: { workflows: PipelinePageData['workflows'] } = $props();

	// 2026-06-08 Bauteil 2.7c: Pipeline-Vorschau zeigt nur die drei
	// produktiven Status (offen/in_arbeit/erledigt). Blockiert bleibt der
	// vollen LIFE-Sicht vorbehalten (kein blockiert in der Vorschau, um
	// den Pipeline-Datenfluss positiv zu halten).
	type Status = 'offen' | 'in_arbeit' | 'erledigt';

	const grouped = $derived.by(() => {
		const out: Record<Status, PipelinePageData['workflows']> = {
			offen: [], in_arbeit: [], erledigt: []
		};
		for (const w of workflows) {
			const s = w.workflow.status as Status;
			if (s in out) out[s].push(w);
		}
		return out;
	});

	const cols: { key: Status; label: string; dotColor: string }[] = [
		{ key: 'offen', label: 'Offen', dotColor: 'slate' },
		{ key: 'in_arbeit', label: 'In Arbeit', dotColor: 'blue' },
		{ key: 'erledigt', label: 'Erledigt', dotColor: 'green' }
	];

	function fmtDate(iso: string | null): string {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' });
		} catch {
			return iso.slice(0, 10);
		}
	}

	function fmtPrice(v: number | null): string {
		if (v == null) return '';
		return v.toLocaleString('de-CH');
	}
</script>

<div class="kgate">
	<div class="gate-row">
		<div class="gate-chip">
			Konsens: Top-5 bei beiden Usern → Besichtigung beantragen
		</div>
		<a class="open-link" href="/vault?act=2&chapter=4">Kampagne öffnen ↗</a>
	</div>
	<div class="gate-sub">
		aus Council-Lens · <code>regelwerk.yaml</code> · <code>consensus_top_n</code>
	</div>
</div>

<div class="kboard">
	{#each cols as col (col.key)}
		<section class="kcol">
			<header class="kcol-head">
				<span class="dot dot-{col.dotColor}"></span>
				<span class="label">{col.label}</span>
				<span class="count">{grouped[col.key].length}</span>
			</header>
			{#if grouped[col.key].length === 0}
				<div class="empty">—</div>
			{:else}
				{#each grouped[col.key] as item (item.workflow.id)}
					<div class="kcard">
						<div class="addr">
							{item.object?.address ?? item.object?.title ?? item.workflow.council_object_id.slice(0, 12)}
						</div>
						<div class="meta">
							{#if col.key === 'offen'}
								<span>beantragt {fmtDate(item.workflow.recorded_at)}</span>
							{:else if col.key === 'in_arbeit' && item.workflow.termin}
								<span>Termin {fmtDate(item.workflow.termin)}</span>
							{:else if col.key === 'erledigt' && item.workflow.verhandlungspreis}
								<span>VHB {fmtPrice(item.workflow.verhandlungspreis)}</span>
							{/if}
							{#if item.object?.portal}
								<span class="portal">· {item.object.portal}</span>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		</section>
	{/each}
</div>

<style>
	.kgate {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px 14px;
		background: white;
		border: 1px solid hsl(214 25% 90%);
		border-radius: 12px;
		border-left: 3px solid hsl(22 95% 52%);
	}
	.gate-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.gate-chip {
		display: inline-block;
		padding: 4px 10px;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		color: hsl(22 90% 38%);
		background: hsl(28 95% 96%);
		border-radius: 6px;
	}
	.open-link {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11.5px;
		color: hsl(222 47% 25%);
		text-decoration: none;
		padding: 4px 8px;
		border: 1px solid hsl(214 25% 88%);
		border-radius: 6px;
	}
	.open-link:hover { background: hsl(214 28% 96%); }
	.gate-sub {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		color: hsl(215 16% 50%);
	}
	.gate-sub code {
		background: hsl(214 28% 95%);
		padding: 0 4px;
		border-radius: 3px;
	}

	.kboard {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-top: 12px;
	}
	.kcol {
		background: hsl(214 28% 97%);
		border-radius: 10px;
		padding: 10px;
		min-height: 120px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.kcol-head {
		display: flex;
		align-items: center;
		gap: 7px;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
		font-weight: 500;
	}
	.kcol-head .label { color: hsl(222 47% 25%); }
	.kcol-head .count {
		margin-left: auto;
		font-size: 10px;
		background: hsl(220 35% 85%);
		color: hsl(222 47% 25%);
		padding: 1px 6px;
		border-radius: 999px;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 999px;
	}
	.dot-slate { background: hsl(215 16% 50%); }
	.dot-blue  { background: hsl(217 80% 52%); }
	.dot-green { background: hsl(142 64% 42%); }

	.empty {
		text-align: center;
		color: hsl(215 16% 60%);
		font-size: 14px;
		padding: 16px 0;
		font-style: italic;
	}
	.kcard {
		background: white;
		border: 1px solid hsl(214 25% 88%);
		border-radius: 7px;
		padding: 8px 10px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.addr {
		font-size: 12.5px;
		font-weight: 500;
		color: hsl(222 47% 11%);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.meta {
		display: flex;
		gap: 6px;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		color: hsl(215 16% 47%);
	}
	.portal { opacity: 0.7; }
</style>
