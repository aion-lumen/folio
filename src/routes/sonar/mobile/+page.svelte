<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { ArrowLeft, Check, LoaderCircle, Radar, RefreshCw, TriangleAlert } from 'lucide-svelte';
	import PlacementWorkspace from '$lib/sonar/PlacementWorkspace.svelte';

	let { data } = $props();
	let searchStatus = $state(data.searchStatus);
	let searchError = $state('');
	let starting = $state(false);
	const timeLabel = (value: string) => new Date(value).toLocaleString('de-CH', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
	let refreshing = false;

	async function refreshSearchStatus() {
  if (refreshing) return;
  refreshing = true;
  try {
   const response = await fetch('/api/sonar/search-run');
   if (response.ok) {
    const value = await response.json();
    const changed = JSON.stringify(value) !== JSON.stringify(searchStatus);
    searchStatus = value;
    if (changed && value.state !== 'running') await invalidateAll();
    searchError = '';
   } else { searchError = 'Status nicht erreichbar. Bitte Verbindung prüfen.'; }
		} catch {
			searchError = 'Verbindung unterbrochen. Gespeicherte Vorschläge bleiben sichtbar.';
		} finally { refreshing = false;
		}
	}

	async function startSearch() {
		starting = true;
		searchError = '';
		try {
			const response = await fetch('/api/sonar/search-run', { method: 'POST' });
			const value = await response.json();
			if (!response.ok && response.status !== 409) {
				searchError = value.error ?? 'Der Suchlauf konnte nicht gestartet werden.';
				return;
			}
			searchStatus = value;
		} catch {
			searchError = 'Folio ist gerade nicht erreichbar.';
		} finally {
			starting = false;
		}
	}

	onMount(() => {
		const timer = window.setInterval(() => {
			if (document.visibilityState === 'visible') void refreshSearchStatus();
		}, 5_000);
		return () => window.clearInterval(timer);
	});
</script>

<svelte:head>
	<title>Folio · Sonar mobil</title>
	<meta name="theme-color" content="#f8fafc" />
</svelte:head>

<div class="sonar-mobile-root">
	<header>
		<a class="back" href="/mobile" aria-label="Zur Folio-Zentrale"><ArrowLeft size={21} /></a>
		<div class="mark"><Radar size={20} /></div>
		<div class="brand-copy"><strong>Folio</strong><span>Sonar · Prüfung</span></div>
	</header>
	<main>
		<section class="search-card" aria-label="Sonar-Suchlauf">
			<div class="search-heading">
				<div>
					<span>NEUE GELEGENHEITEN</span>
					<h1>Aktuelle Gelegenheiten</h1>
				</div>
				{#if searchStatus.state === 'running'}
					<span class="spin"><LoaderCircle size={24} /></span>
				{:else if searchStatus.state === 'completed'}
					<Check size={24} />
				{:else if searchStatus.state === 'failed'}
					<TriangleAlert size={24} />
				{:else}
					<RefreshCw size={23} />
				{/if}
			</div>

			{#if searchStatus.state === 'running'}
				<div class="run-state running"><span class="spin"><LoaderCircle size={18} /></span>Läuft seit {searchStatus.elapsedSeconds} Sekunden …</div>
			{:else if searchStatus.state === 'completed'}
				<div class="run-state success">
					<Check size={18} /> {timeLabel(searchStatus.finishedAt)} · {searchStatus.summary.created} neue Vorschläge
				</div>
				<small>{searchStatus.summary.liked} Likes · {searchStatus.summary.bookmarked ?? 0} Lesezeichen · {searchStatus.summary.searched} Suchtreffer</small>
				{#if searchStatus.summary.acquisition === 'cache'}<small>Aus gespeicherten Quellen{searchStatus.summary.acquiredAt ? ` vom ${timeLabel(searchStatus.summary.acquiredAt)}` : ''} · kein neuer Abruf bei X</small>{/if}

			{:else if searchStatus.state === 'failed'}
				<div class="run-state failed"><TriangleAlert size={18} />{searchStatus.message ?? 'Letzter Suchlauf fehlgeschlagen. Gespeicherte Treffer bleiben erhalten.'}</div>
			{/if}
			{#if searchError}<div class="run-state failed"><TriangleAlert size={18} />{searchError}</div>{/if}

			<button
				type="button"
				onclick={startSearch}
				disabled={!data.canRunSearch || !searchStatus.configured || searchStatus.state === 'running' || starting}
			>
				{#if starting || searchStatus.state === 'running'}<span class="spin"><LoaderCircle size={20} /></span>{/if}
				{searchStatus.state === 'running' ? 'Sonar sucht …' : 'Jetzt suchen'}
			</button>
			{#if !searchStatus.configured}<small>Der private Such-Runner ist auf diesem Folio-Server noch nicht verbunden.</small>{/if}
		</section>

		<PlacementWorkspace
			placementState={data.placements}
			publicationState={data.publications}
			canReview={data.canReview}
			canApprove={data.canApprove}
			initialCandidateId={data.initialCandidateId}
			compact
		/>
	</main>
</div>

<style>
	:global(body) { background: hsl(210 25% 98.5%); }
	.sonar-mobile-root { --sonar: hsl(181 53% 34%); min-height: 100vh; max-width: 520px; margin: 0 auto; border-inline: 1px solid var(--color-border); background: var(--color-background); font-size: 18px; }
	header { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 9px; padding: calc(10px + env(safe-area-inset-top)) 15px 10px; border-bottom: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-background) 94%, transparent); backdrop-filter: blur(12px); }
	.back { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; color: var(--color-foreground); }
	.mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; color: var(--sonar); background: color-mix(in srgb, var(--sonar) 12%, var(--color-background)); }
	.brand-copy { display: flex; flex-direction: column; gap: 1px; }
	header strong { font-size: 16px; font-weight: 650; }
	header span { color: var(--color-muted-foreground); font-size: 12px; }
	main { padding: 14px 12px calc(28px + env(safe-area-inset-bottom)); }
	.search-card { margin: 0 0 14px; padding: 18px; border: 1px solid color-mix(in srgb, var(--sonar) 24%, var(--color-border)); border-radius: 20px; background: linear-gradient(145deg, color-mix(in srgb, var(--sonar) 7%, white), white 68%); box-shadow: 0 12px 30px hsl(190 20% 20% / .05); }
	.search-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; color: var(--sonar); }
	.search-heading span { font-size: 11px; font-weight: 750; letter-spacing: .11em; }
	.search-heading h1 { margin: 3px 0 0; color: var(--color-foreground); font-size: 1.24rem; line-height: 1.2; }
	.run-state { display: flex; align-items: center; gap: 7px; margin: 0 0 12px; font-size: .78rem; font-weight: 600; }
	.run-state.running { color: hsl(205 62% 38%); }
	.run-state.success { color: hsl(156 46% 33%); }
	.run-state.failed { color: hsl(3 55% 43%); }
	.search-card button { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 50px; border: 0; border-radius: 15px; color: white; background: var(--sonar); font: inherit; font-size: .93rem; font-weight: 700; }
	.search-card button:disabled { cursor: not-allowed; opacity: .48; }
	.search-card small { display: block; margin-top: 9px; color: var(--color-muted-foreground); font-size: .7rem; line-height: 1.4; }
	.spin { animation: spin 1s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (max-width: 480px) { .sonar-mobile-root { border-inline: 0; } }
</style>
