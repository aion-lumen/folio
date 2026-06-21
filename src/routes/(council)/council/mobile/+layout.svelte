<!--
  Mobile 1a (2026-05-30): minimal wrapper for all /council/mobile/* pages.
  AppShell is bypassed via the isMobileRoute conditional in AppShell.svelte.
  Phone-frame width on desktop: max 480px, centered, body padded.
-->
<script lang="ts">
	import { page } from '$app/state';
	import MobileAppHead from '$lib/council/mobile/MobileAppHead.svelte';
	import MobileTabBar from '$lib/council/mobile/MobileTabBar.svelte';
	import '$lib/council/mobile/mobile-tokens.css';

	let { children } = $props();

	function currentTabLabel(pathname: string): string {
		if (pathname.startsWith('/council/mobile/pipeline')) return 'Pipeline';
		if (pathname.startsWith('/council/mobile/meine-10')) return 'Meine 10';
		if (pathname.startsWith('/council/mobile/suche')) return 'Suche';
		if (/\/council\/mobile\/[^/]+/.test(pathname) && !pathname.endsWith('/council/mobile'))
			return 'Objekt';
		return 'Verlauf';
	}

	const where = $derived(currentTabLabel(page.url.pathname));
	const userInitials = $derived(
		(page.data.user?.display_name ?? 'IC').slice(0, 2).toUpperCase()
	);
</script>

<div class="council-mobile-root">
	<MobileAppHead {where} {userInitials} />
	<main class="body">
		{@render children()}
	</main>
	<MobileTabBar />
</div>

<style>
	.council-mobile-root {
		min-height: 100vh;
		background: var(--wf-bg, hsl(210 25% 98.5%));
		color: var(--wf-fg, hsl(222 30% 22%));
		max-width: 480px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		border-left: 1px solid var(--wf-line, hsl(214 20% 88%));
		border-right: 1px solid var(--wf-line, hsl(214 20% 88%));
	}
	@media (max-width: 480px) {
		.council-mobile-root {
			border-left: 0;
			border-right: 0;
		}
	}
	.body {
		flex: 1;
		padding: 14px 16px calc(72px + env(safe-area-inset-bottom));
	}
</style>
