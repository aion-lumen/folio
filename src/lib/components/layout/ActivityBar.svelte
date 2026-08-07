<!--
  F.9 Block-1 — Activity-Bar (Workspace-Navigation).
  Architekt-Spec D1: 48-56px breit, 5 Glyphs (Heute, Vault, Mail, Pipeline, Settings).
  Worker-Pille direkt UNTER Pipeline-Glyph (Architekt-Ergänzung 2026-05-20).
  Settings am Bottom mit margin-top:auto.
  Active-State leitet sich aus $page.url.pathname ab.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Home, Map, Inbox, Workflow, Users, Radar, Settings } from 'lucide-svelte';
	import WorkerPill from './ActivityBar/WorkerPill.svelte';

	type Workspace = 'heute' | 'vault' | 'mail' | 'pipeline' | 'council' | 'sonar' | 'settings' | 'other';

	function detectWorkspace(pathname: string): Workspace {
		// Post-Block-3 URL-Tree: / ist Heute-Hub, Vault wandert nach /vault.
		if (pathname === '/' || pathname === '/heute') return 'heute';
		if (pathname.startsWith('/vault')) return 'vault';
		if (pathname.startsWith('/mail-queue')) return 'mail';
		if (pathname.startsWith('/pipeline')) return 'pipeline';
		if (pathname.startsWith('/council')) return 'council';
		if (pathname.startsWith('/sonar')) return 'sonar';
		if (pathname.startsWith('/settings')) return 'settings';
		// /setup is its own pre-app route, not part of workspace nav
		return 'other';
	}

	const active = $derived(detectWorkspace(page.url.pathname));

	interface NavItem {
		key: Workspace;
		label: string;
		href: string;
		Icon: typeof Home;
	}

	// F.9 Block-3: / IST Heute-Hub (kein separates /heute). Plan-Decision.
	const items: NavItem[] = [
		{ key: 'heute', label: 'Heute', href: '/', Icon: Home },
		{ key: 'vault', label: 'Vault', href: '/vault', Icon: Map },
		{ key: 'mail', label: 'Mail', href: '/mail-queue', Icon: Inbox },
		{ key: 'pipeline', label: 'Pipeline', href: '/pipeline', Icon: Workflow },
		{ key: 'council', label: 'Council', href: '/council', Icon: Users },
		{ key: 'sonar', label: 'Sonar', href: '/sonar', Icon: Radar }
	];

	function go(href: string, e: MouseEvent) {
		e.preventDefault();
		goto(href);
	}
</script>

<nav class="activity-bar" aria-label="Workspace-Navigation">
	<ul class="glyph-list">
		{#each items as item (item.key)}
			{@const isActive = active === item.key}
			<li>
				<a
					href={item.href}
					class="glyph"
					class:glyph-active={isActive}
					title={item.label}
					aria-label={item.label}
					aria-current={isActive ? 'page' : undefined}
					onclick={(e) => go(item.href, e)}
				>
					<item.Icon size={18} />
				</a>
			</li>
			{#if item.key === 'pipeline'}
				<!-- F.9 D3: Worker-Pille direkt unter Pipeline-Glyph (Architekt-Spec 2026-05-20) -->
				<li class="pill-slot">
					<WorkerPill />
				</li>
			{/if}
		{/each}
	</ul>

	<!-- Settings am Bottom -->
	<div class="settings-slot">
		<a
			href="/settings"
			class="glyph"
			class:glyph-active={active === 'settings'}
			title="Einstellungen"
			aria-label="Einstellungen"
			onclick={(e) => go('/settings', e)}
		>
			<Settings size={18} />
		</a>
	</div>
</nav>

<style>
	.activity-bar {
		flex-shrink: 0;
		width: 52px;
		display: flex;
		flex-direction: column;
		background: var(--color-card);
		border-right: 1px solid var(--color-border);
		padding: 8px 0;
	}

	.glyph-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.glyph-list li {
		display: flex;
		justify-content: center;
		padding: 0 8px;
	}

	.glyph {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		color: var(--color-muted-foreground);
		text-decoration: none;
		transition: background 150ms, color 150ms;
		position: relative;
	}
	.glyph:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.glyph.glyph-active {
		background: color-mix(in srgb, var(--color-lumen, hsl(45 96% 55%)) 18%, transparent);
		color: var(--color-foreground);
	}
	.glyph.glyph-active::before {
		content: '';
		position: absolute;
		left: -8px;
		top: 8px;
		bottom: 8px;
		width: 2px;
		background: var(--color-lumen, hsl(45 96% 55%));
		border-radius: 0 2px 2px 0;
	}

	.pill-slot {
		padding: 0 8px;
		margin-top: 2px;
	}

	.settings-slot {
		margin-top: auto;
		display: flex;
		justify-content: center;
		padding: 0 8px;
	}
</style>
