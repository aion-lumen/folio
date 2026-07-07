<!--
  F.9 Block-4 — Heute-Hub.
  4 Cards (Vault, Mail, Pipeline, Hermes) zeigen Cross-Modul-Awareness.
  / IST Heute (kein separates /heute). Cards navigieren zum Modul oder
  öffnen Workspace-Layer (Hermes via chatStore.toggle).
-->
<script lang="ts">
	import CardVault from '$lib/heute/CardVault.svelte';
	import CardMail from '$lib/heute/CardMail.svelte';
	import CardPipeline from '$lib/heute/CardPipeline.svelte';
	import CardHermes from '$lib/heute/CardHermes.svelte';
	import CardInbox from '$lib/heute/CardInbox.svelte';

	let { data } = $props();

	function fmtDate(): string {
		return new Date().toLocaleDateString('de-CH', {
			weekday: 'long',
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Folio · Heute</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<p class="date">{fmtDate()}</p>
		<h1>Heute</h1>
	</header>

	<section class="card-grid">
		<CardVault vaultPresent={data.vaultPresent} />
		<CardMail stats={data.mail} />
		<CardInbox pending={data.inboxPending} triage={data.inboxTriage} />
		<CardPipeline lastRun={data.lastRun} />
		<CardHermes />
	</section>
</div>

<style>
	.page {
		max-width: 1080px;
		margin: 0 auto;
		padding: 48px 32px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}

	.page-header { display: flex; flex-direction: column; gap: 4px; }
	.date {
		margin: 0;
		font-size: 13px;
		color: var(--color-muted-foreground);
		text-transform: capitalize;
	}
	h1 {
		margin: 0;
		font-size: 32px;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--color-foreground);
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
	@media (min-width: 900px) {
		.card-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (max-width: 640px) {
		.card-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
