<!--
  Mobile 1a (2026-05-30): bottom-fixed tab bar for /council/mobile.
  Active state from current pathname. Four tabs per the Vier-Tab design.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { List, Workflow, Star, Search } from 'lucide-svelte';

	const tabs = [
		{ href: '/council/mobile', label: 'Verlauf', icon: List, match: /^\/council\/mobile\/?$/ },
		{ href: '/council/mobile/pipeline', label: 'Pipeline', icon: Workflow, match: /^\/council\/mobile\/pipeline/ },
		{ href: '/council/mobile/meine-10', label: 'Meine 10', icon: Star, match: /^\/council\/mobile\/meine-10/ },
		{ href: '/council/mobile/suche', label: 'Suche', icon: Search, match: /^\/council\/mobile\/suche/ }
	] as const;

	function isActive(matchRe: RegExp): boolean {
		return matchRe.test(page.url.pathname);
	}
</script>

<nav class="tab-bar" aria-label="Mobile-Navigation">
	{#each tabs as t (t.href)}
		{@const active = isActive(t.match)}
		<a class="tab" class:active href={t.href} aria-current={active ? 'page' : undefined}>
			<span class="ic"><t.icon size={20} strokeWidth={active ? 2.4 : 1.8} /></span>
			<span class="lbl">{t.label}</span>
		</a>
	{/each}
</nav>

<style>
	.tab-bar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 4px;
		padding: 8px 10px calc(10px + env(safe-area-inset-bottom));
		background: white;
		border-top: 1px solid var(--wf-line, hsl(214 20% 88%));
		z-index: 50;
	}
	@media (min-width: 480px) {
		.tab-bar {
			max-width: 480px;
			margin: 0 auto;
			border-left: 1px solid var(--wf-line, hsl(214 20% 88%));
			border-right: 1px solid var(--wf-line, hsl(214 20% 88%));
		}
	}
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 4px 0;
		border-radius: 8px;
		color: var(--wf-muted, hsl(215 16% 50%));
		text-decoration: none;
		font-family: var(--font-mono);
		font-size: 9.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.tab.active {
		color: hsl(222 47% 11%);
	}
	.ic {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.lbl {
		line-height: 1;
	}
</style>
