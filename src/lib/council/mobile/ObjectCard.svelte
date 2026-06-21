<!--
  Mobile 1a (2026-05-30): foto-led card for council objects. Reused in
  Verlauf entries (1a) and Pipeline/Meine-10/Suche from 1b onward.

  Photo always renders — empty slot with ⌂ glyph when no photo_url. This
  keeps card heights constant across the list (design principle 1).
-->
<script lang="ts">
	import type { CouncilObjectRow, CouncilVoice, CouncilConsensusState } from '$lib/server/council-db/types.js';
	import type { SubstanceProvenance } from '$lib/server/council-db/cluster-substance.js';
	import CouncilStimmenStreifenMini from '../CouncilStimmenStreifenMini.svelte';
	import { shortPortal } from '$lib/council/portalLabel.js';

	let {
		object,
		voices,
		state,
		href,
		photoSize = 60,
		emberLeft = false,
		extraLine,
		clusterMembers,
		clusterRankNeighbor,
		statusProvenance
	}: {
		object: CouncilObjectRow;
		voices?: CouncilVoice[];
		state?: CouncilConsensusState;
		href?: string;
		photoSize?: number;
		emberLeft?: boolean;
		extraLine?: string;
		// Bauteil-9 (2026-06-09) Cross-Portal-Cluster-Mitglieder.
		// Null oder leer = Single-Member, keine Pille gerendert.
		clusterMembers?: Array<{ id: string; portal: string }> | null;
		// Bauteil-11 D3-B (2026-06-10) Cluster-Rank-Indikator.
		// Wenn gesetzt: dieses Object ist KEIN Top-10-Eintrag, aber
		// ein Cluster-Bruder schon. Pille „Bruder auf #X in Top-10".
		clusterRankNeighbor?: { object_id: string; rank: number; user_id: number } | null;
		statusProvenance?: SubstanceProvenance | null;
	} = $props();

	function specLine(o: CouncilObjectRow): string {
		const parts: string[] = [];
		if (o.qm != null) parts.push(`${o.qm} m²`);
		if (o.price_value != null) {
			const m = o.price_value / 1_000_000;
			parts.push(m >= 1 ? `${m.toFixed(2)} M` : `${(o.price_value / 1000).toFixed(0)} k`);
		}
		if (o.bj != null) parts.push(`BJ ${o.bj}`);
		return parts.join(' · ');
	}

	const Tag = $derived(href ? 'a' : 'div');
	const inheritedFromPortal = $derived(
		statusProvenance?.kind === 'inherited' && statusProvenance.from_portal
			? shortPortal(statusProvenance.from_portal)
			: null
	);
</script>

<svelte:element this={Tag} class="pcard" class:ember={emberLeft} {href}>
	<div class="photo" class:empty={!object.photo_url} style="width: {photoSize}px; height: {photoSize}px;">
		{#if object.photo_url}
			<img src={object.photo_url} alt="" loading="lazy" />
		{:else}
			<span class="empty-glyph" aria-hidden="true">⌂</span>
		{/if}
	</div>
	<div class="body">
		<div class="title">{object.address ?? object.title ?? '—'}</div>
		<div class="spec">{specLine(object)}</div>
		{#if extraLine}
			<div class="extra">{extraLine}</div>
		{/if}
		{#if clusterMembers && clusterMembers.length > 0}
			<div class="cluster-pill" title="Cross-Portal-Wiedererkennung (Bauteil 9)">
				auch auf: {clusterMembers.map((m) => shortPortal(m.portal)).join(', ')}
			</div>
		{/if}
		{#if clusterRankNeighbor}
			<div class="rank-neighbor-pill" title="Cluster-Bruder hat höheren Top-10-Rang (Bauteil 11)">
				Bruder auf #{clusterRankNeighbor.rank} in Top-10
			</div>
		{/if}
		{#if inheritedFromPortal}
			<div class="inherit-pill" title="Status/Substanz vom Cluster-Bruder (Bauteil 14)">
				übernommen von Bruder auf {inheritedFromPortal}
			</div>
		{/if}
		{#if voices && state}
			<div class="foot">
				<CouncilStimmenStreifenMini {voices} {state} />
			</div>
		{/if}
	</div>
</svelte:element>

<style>
	.pcard {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 10px;
		padding: 9px 10px;
		background: white;
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
		border-radius: 8px;
		margin-bottom: 8px;
		color: inherit;
		text-decoration: none;
	}
	.pcard.ember {
		border-left: 3px solid hsl(28 80% 60%);
		background: hsl(28 95% 99%);
	}
	.photo {
		border-radius: 6px;
		flex-shrink: 0;
		overflow: hidden;
		position: relative;
		background: repeating-linear-gradient(135deg, hsl(210 18% 90%) 0 5px, hsl(210 18% 94%) 5px 10px);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.photo.empty {
		background: hsl(214 20% 96%);
		border: 1px dashed var(--wf-line-strong, hsl(214 25% 78%));
	}
	.photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.empty-glyph {
		font-size: 18px;
		color: var(--wf-line-strong, hsl(214 25% 78%));
	}
	.body {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.title {
		font-size: var(--text-base, 14px);
		font-weight: var(--font-weight-bold, 600);
		letter-spacing: -0.01em;
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.spec {
		font-family: var(--font-mono);
		font-size: var(--text-sm, 12px);
		font-weight: var(--font-weight-medium, 500);
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	.extra {
		font-family: var(--font-mono);
		font-size: var(--text-sm, 12px);
		color: var(--ember-fg, hsl(28 80% 38%));
	}
	/* Bauteil-9 (2026-06-09) Cross-Portal-Cluster-Pille: dezent,
	   muted-color, kein Hervorhebungs-Ember. Bewusst weniger
	   dominant als .extra. */
	.cluster-pill {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--wf-muted, hsl(215 16% 50%));
		font-style: italic;
	}
	/* Bauteil-11 D3-B (2026-06-10) Cluster-Rank-Indikator: analog
	   .cluster-pill aber sticht etwas mehr hervor (Top-10-Substanz). */
	.rank-neighbor-pill {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--ember-fg, hsl(28 80% 38%));
	}
	.inherit-pill {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--wf-muted, hsl(215 16% 50%));
		font-style: italic;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 2px;
	}
</style>
