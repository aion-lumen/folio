<!--
	StimmenStreifen — Lens-UI Bühne-+-Kacheln aus Handoff 3 (A·v2 final).

	Pixel-genaue Übernahme aus
	`folio-mail/project/Folio Mail-Queue - Stimmen-Streifen (final).html`
	§ STIMMEN-STREIFEN-CSS (Zeilen 134-198) + § missing-Treatment (Z. 178-189).

	Dumb component: empfängt voices + state, rendert. Keine Konsens-Berechnung
	hier (passiert serverseitig via $lib/server/lenses/voices.ts:stripeState
	beim Page-Load, per Direktive lens-ui-2026-05-26 §2.2).

	§ VI „NICHT v2"-Regeln (explizit befolgt):
	- KEINE 5. Kachel für User-Stimme (Final/User bleibt im Detail-Panel)
	- KEINE Lautstärke-Inversion (Ember = Disagreement, NICHT Reife)
	- Nur 3 Bühnen-Stufen (still · ne · ne-strong)
	- KEINE Corona/Lumen-Bright-Hintergründe
	- missing-Kachel grau-dashed, NICHT lumen-ember-dashed wie v3/v4
-->
<script lang="ts">
	import type { Voice, ConsensusState } from '$lib/server/lenses/voices.js';

	interface Props {
		voices: Voice[];
		state: ConsensusState;
	}
	let { voices, state }: Props = $props();

	function tooltipFor(v: Voice): string {
		if (v.kind === 'present') {
			const conf = v.confidence != null ? ` · ${v.confidence.toFixed(2)}` : '';
			return `${v.label} · sagt ${v.domain}${conf}`;
		}
		return `${v.label} · ${v.reason}`;
	}
</script>

<span
	class="stripe"
	class:still={state === 'still'}
	class:ne={state === 'ne'}
	class:ne-strong={state === 'ne-strong'}
>
	{#each voices as v (v.label)}
		{#if v.kind === 'present'}
			<span
				class="qcell qc-{v.domain}"
				data-label={v.label}
				title={tooltipFor(v)}
			></span>
		{:else}
			<span class="qcell missing" title={tooltipFor(v)}></span>
		{/if}
	{/each}
</span>

<style>
	/* Domain-Farben — exakt aus (final).html :root Z. 11-17 */
	.stripe {
		--dom-immo: hsl(217 70% 60%);
		--dom-job: hsl(165 50% 45%);
		--dom-shop: hsl(38 80% 55%);
		--dom-finance: hsl(0 65% 55%);
		--dom-kontakt: hsl(280 50% 55%);
		--dom-werbung: hsl(210 8% 60%);
		--dom-system: hsl(210 8% 50%);

		--disagr-border: hsl(28 80% 86%);

		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 4px 6px;
		border-radius: 6px;
		background: transparent;
		transition:
			background 120ms ease,
			box-shadow 120ms ease;
	}

	.stripe .qcell {
		width: 20px;
		height: 20px;
		border-radius: 4px;
		border: 1px solid hsl(0 0% 0% / 0.06);
		position: relative;
	}
	.stripe .qcell::after {
		content: attr(data-label);
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 10px;
		color: hsl(0 0% 100% / 0.95);
		font-weight: 500;
		letter-spacing: 0.02em;
	}

	/* Bühnen-States — exakt aus (final).html Z. 160-175 */
	.stripe.still {
		background: transparent;
	}
	.stripe.ne {
		background: hsl(28 95% 94%);
		box-shadow:
			0 0 0 1px var(--disagr-border) inset,
			0 0 14px -2px hsl(28 95% 70% / 0.55);
	}
	.stripe.ne-strong {
		background: hsl(28 95% 90%);
		box-shadow:
			0 0 0 1px hsl(28 80% 70%) inset,
			0 0 18px -2px hsl(28 95% 60% / 0.7);
	}

	/* missing-Lens — exakt aus (final).html Z. 178-189
	   NEUTRAL grau-dashed mit Mittelpunkt-Glyph, NICHT in der Ember-Familie. */
	.stripe .qcell.missing {
		background: transparent !important;
		border: 1.5px dashed hsl(0 0% 0% / 0.22);
	}
	.stripe .qcell.missing::after {
		content: '·';
		color: hsl(0 0% 0% / 0.32);
		font-size: 13px;
		font-weight: 400;
		line-height: 1;
		padding-bottom: 2px;
	}

	/* Domain-Kachel-Farben — exakt aus (final).html Z. 192-198 */
	.stripe .qcell.qc-immo { background: var(--dom-immo); }
	.stripe .qcell.qc-job { background: var(--dom-job); }
	.stripe .qcell.qc-werbung { background: var(--dom-werbung); }
	.stripe .qcell.qc-kontakt { background: var(--dom-kontakt); }
	.stripe .qcell.qc-shop { background: var(--dom-shop); }
	.stripe .qcell.qc-finance { background: var(--dom-finance); }
	.stripe .qcell.qc-system { background: var(--dom-system); }
	/* unsorted fällt auf default border-grau zurück (kein expliziter Fill) */
	.stripe .qcell.qc-unsorted {
		background: hsl(0 0% 88%);
	}
</style>
