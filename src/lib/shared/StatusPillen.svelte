<!--
  2026-06-05 Bauteil 4: Drei Status-Pillen (Entfernung / qm² / Preis)
  mit Schwellen-Farbe (ok = grün, over = rot, unknown = grau).

  Geteilte Component fuer Mail-Detail-Panel + Council-Detail-Panel
  (Desktop + Mobile). Pille zeigt label + formatierten Wert +
  Hintergrund-Farbe je nach Schwellen-Match.
-->
<script lang="ts">
	type Status = 'ok' | 'over' | 'unknown';

	export interface PillenProps {
		entfernung?: { km: number | null; threshold: number };
		qm?: { value: number | null; min: number };
		preis?: { value: number | null; max: number; on_request?: boolean };
		/** Wenn true: nur Entfernung rendern (fuer Mail-Detail, wo qm/preis fehlt). */
		nurEntfernung?: boolean;
	}

	let { entfernung, qm, preis, nurEntfernung = false }: PillenProps = $props();

	function pillEntfernung(): { label: string; value: string; status: Status } {
		if (!entfernung || entfernung.km == null)
			return { label: 'ENTFERNUNG', value: '—', status: 'unknown' };
		const km = entfernung.km;
		const status: Status = km <= entfernung.threshold ? 'ok' : 'over';
		return {
			label: 'ENTFERNUNG',
			value: `~${km.toFixed(0)} km`,
			status
		};
	}

	function pillQm(): { label: string; value: string; status: Status } {
		if (!qm || qm.value == null) return { label: 'QM²', value: '—', status: 'unknown' };
		const status: Status = qm.value >= qm.min ? 'ok' : 'over';
		return { label: 'QM²', value: `${qm.value}`, status };
	}

	function pillPreis(): { label: string; value: string; status: Status } {
		if (!preis) return { label: 'PREIS', value: '—', status: 'unknown' };
		if (preis.on_request) return { label: 'PREIS', value: 'auf Anfrage', status: 'unknown' };
		if (preis.value == null) return { label: 'PREIS', value: '—', status: 'unknown' };
		const status: Status = preis.value <= preis.max ? 'ok' : 'over';
		const formatted = preis.value.toLocaleString('de-CH').replace(/,/g, "'");
		return { label: 'PREIS', value: `${formatted}`, status };
	}

	const e = $derived(pillEntfernung());
	const q = $derived(pillQm());
	const p = $derived(pillPreis());
</script>

<div class="pillen">
	<div class="pille pille-{e.status}">
		<div class="pille-label">{e.label}</div>
		<div class="pille-value">{e.value}</div>
	</div>
	{#if !nurEntfernung}
		<div class="pille pille-{q.status}">
			<div class="pille-label">{q.label}</div>
			<div class="pille-value">{q.value}</div>
		</div>
		<div class="pille pille-{p.status}">
			<div class="pille-label">{p.label}</div>
			<div class="pille-value">{p.value}</div>
		</div>
	{/if}
</div>

<style>
	.pillen {
		display: flex;
		gap: 6px;
		padding: 8px 0;
	}
	.pille {
		flex: 1;
		padding: 8px 10px;
		border-radius: 6px;
		border: 1px solid;
		text-align: center;
		font-family: var(--font-mono);
	}
	.pille-label {
		font-size: 9.5px;
		letter-spacing: 0.05em;
		opacity: 0.7;
		margin-bottom: 2px;
	}
	.pille-value {
		font-size: 13px;
		font-weight: 500;
	}
	.pille-ok {
		background: var(--verdict-kaufen-bg, hsl(142 50% 95%));
		color: var(--verdict-kaufen-fg, hsl(142 65% 25%));
		border-color: var(--verdict-kaufen-bd, hsl(142 40% 80%));
	}
	.pille-over {
		background: var(--verdict-verwerfen-bg, hsl(0 70% 96%));
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
		border-color: var(--verdict-verwerfen-bd, hsl(0 60% 84%));
	}
	.pille-unknown {
		background: hsl(214 15% 96%);
		color: hsl(215 16% 50%);
		border-color: hsl(214 20% 88%);
	}
</style>
