<!--
  Mobile 1b (2026-05-30): reusable status pill for workflow + general status_tag.
  Variants pick token from mobile-tokens.css.
-->
<script lang="ts">
	let {
		variant,
		label,
		dot = true
	}: {
		variant: 'neu' | 'offen' | 'in_arbeit' | 'blockiert' | 'erledigt' | 'kaufen' | 'beobachten' | 'verworfen';
		label: string;
		dot?: boolean;
	} = $props();
</script>

<span class="pill {variant}">
	{#if dot}<span class="dot" aria-hidden="true"></span>{/if}
	{label}
</span>

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 1px 8px;
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 500;
		border: 1px solid;
		white-space: nowrap;
	}
	.dot {
		width: 5px;
		height: 5px;
		border-radius: 999px;
	}
	.neu {
		background: var(--st-neu-bg);
		color: var(--st-neu-fg);
		border-color: var(--st-neu-bd);
	}
	.neu .dot {
		background: hsl(265 50% 55%);
	}
	.offen {
		background: var(--st-offen-bg);
		color: var(--st-offen-fg);
		border-color: var(--st-offen-bd);
	}
	.offen .dot {
		background: hsl(215 20% 55%);
	}
	.in_arbeit {
		background: var(--st-termin-bg);
		color: var(--st-termin-fg);
		border-color: var(--st-termin-bd);
	}
	.in_arbeit .dot {
		background: hsl(217 70% 50%);
	}
	.blockiert {
		background: hsl(0 75% 95%);
		color: hsl(0 65% 38%);
		border-color: hsl(0 50% 80%);
	}
	.blockiert .dot {
		background: hsl(0 65% 50%);
	}
	.erledigt {
		background: var(--st-besichtigt-bg);
		color: var(--st-besichtigt-fg);
		border-color: var(--st-besichtigt-bd);
	}
	.erledigt .dot {
		background: var(--verdict-kaufen);
	}
	.kaufen {
		background: var(--verdict-kaufen-bg);
		color: var(--verdict-kaufen-fg);
		border-color: var(--verdict-kaufen-bd);
	}
	.kaufen .dot {
		background: var(--verdict-kaufen);
	}
	.beobachten {
		background: var(--verdict-beobachten-bg);
		color: var(--verdict-beobachten-fg);
		border-color: var(--verdict-beobachten-bd);
	}
	.beobachten .dot {
		background: var(--verdict-beobachten);
	}
	.verworfen {
		background: var(--verdict-verwerfen-bg);
		color: var(--verdict-verwerfen-fg);
		border-color: var(--verdict-verwerfen-bd);
	}
	.verworfen .dot {
		background: var(--verdict-verwerfen);
	}
</style>
