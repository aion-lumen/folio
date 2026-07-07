<script lang="ts">
	import { page } from '$app/state';
	import { campaignStore } from '$lib/stores/campaign.svelte.js';
	import { layoutStore } from '$lib/stores/layout.svelte.js';
	import { toastStore } from '$lib/stores/toast.svelte.js';
	import { chatStore } from '$lib/stores/chat.svelte.js';
	import { Maximize2, Minimize2, MessageCircle } from 'lucide-svelte';
	import PulsarMark from '$lib/components/ui/PulsarMark.svelte';
	import MailBadge from '$lib/components/layout/MailBadge.svelte';
	import VaultSwitcher from '$lib/components/layout/VaultSwitcher.svelte';

	const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

	// F.9 Block-3 Quick-Fix: Vault-Substanz (Breadcrumb + Sync-Status) nur auf /vault.
	// campaignStore behält State im SPA-Module-Singleton; ohne Route-Gate würde Header
	// Kampagne überall anzeigen.
	const isVaultRoute = $derived(page.url.pathname.startsWith('/vault'));
	const vaultPath = $derived((page.data.vaultPath as string | undefined) ?? '');

	const act = $derived(campaignStore.activeAct);
	const chapter = $derived(campaignStore.activeChapter);
	const campaign = $derived(isVaultRoute ? campaignStore.campaign : null);
	const syncState = $derived(campaignStore.syncState);
	const lastSynced = $derived(campaignStore.lastSynced);

	const syncedLabel = $derived(
		lastSynced
			? lastSynced.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
			: ''
	);

	const actLabel = $derived(act ? `Akt ${ROMAN[act.act_number] ?? act.act_number}` : '');
	const chapterLabel = $derived(chapter ? `Kapitel ${chapter.chapter_number}` : '');

	// Avatar: first 2 chars of user name (no user.md → fallback "Ich" → "IC")
	const userName = 'Ich';
	const initials = userName.slice(0, 2).toUpperCase();

	let avatarOpen = $state(false);

	function openVault() {
		openVaultSwitcher();
	}

	function closeAvatar() {
		avatarOpen = false;
	}

	let aboutOpen = $state(false);
	let vaultSwitcherOpen = $state(false);

	function openVaultSwitcher() {
		vaultSwitcherOpen = true;
		avatarOpen = false;
	}

	function openSettings() {
		toastStore.show('Einstellungen kommen in v0.2');
		avatarOpen = false;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && layoutStore.focusMode) layoutStore.exitFocus();
		if (avatarOpen && e.key === 'Escape') avatarOpen = false;
		if (vaultSwitcherOpen && e.key === 'Escape') vaultSwitcherOpen = false;
	}}
/>

<!-- Backdrop to close avatar dropdown -->
{#if avatarOpen}
	<div
		class="avatar-backdrop"
		role="button"
		tabindex="-1"
		aria-label="Menü schließen"
		onclick={closeAvatar}
		onkeydown={(e) => e.key === 'Enter' && closeAvatar()}
	></div>
{/if}

<header class="topbar">
	<!-- Left: branding. F.9 Block-3: pointe Brand auf /heute (Default-Hub),
	     früher pointete es auf / das nun ebenfalls Heute ist. -->
	<a href="/" class="brand" aria-label="Folio — Heute">
		<span class="mark"><PulsarMark size={20} /></span>
		<span class="wordmark">Folio</span>
	</a>

	<!-- Center: breadcrumb -->
	{#if campaign}
		<nav class="breadcrumb" aria-label="Kampagnen-Navigation">
			<span class="crumb-user">{userName}</span>
			<span class="crumb-sep">·</span>
			<a href="/vault" class="crumb-link">{campaignStore.campaignTitle}</a>
			{#if actLabel}
				<span class="crumb-sep">›</span>
				<button
					class="crumb-link"
					onclick={() => layoutStore.setSelectedAct(campaign.current_act)}
				>{actLabel}</button>
			{/if}
			{#if chapterLabel}
				<span class="crumb-sep">›</span>
				<span class="crumb-static">{chapterLabel}</span>
			{/if}
		</nav>
	{/if}

	<!-- Right: actions -->
	<div class="actions">
		<!-- FOKUS toggle -->
		<button
			class="action-btn fokus-btn"
			class:fokus-active={layoutStore.focusMode}
			onclick={() => layoutStore.toggleFocus()}
			title={layoutStore.focusMode ? 'Fokus-Modus beenden (Escape)' : 'Fokus-Modus'}
			aria-label="Fokus-Modus umschalten"
		>
			{#if layoutStore.focusMode}
				<Minimize2 size={15} />
				<span class="action-label">FOKUS</span>
			{:else}
				<Maximize2 size={15} />
				<span class="action-label">FOKUS</span>
			{/if}
		</button>

		<!-- Vault chip (always visible when VAULT_PATH set) -->
		{#if layoutStore.vaultName && layoutStore.vaultName !== 'vault'}
			<button
				type="button"
				class="sync-status vault-chip"
				title={vaultPath || `${layoutStore.vaultName} — Vault wechseln`}
				onclick={openVaultSwitcher}
			>
				{#if campaign}
					<span
						class="sync-dot"
						class:sync-synced={syncState === 'synced'}
						class:sync-syncing={syncState === 'syncing'}
						class:sync-error={syncState === 'error'}
					></span>
				{/if}
				<span class="sync-label">{layoutStore.vaultName}.local</span>
				{#if campaign && syncedLabel && syncState !== 'error'}
					<span class="sync-time">synced {syncedLabel}</span>
				{/if}
			</button>
		{/if}

		<!-- Mail status badge -->
		<MailBadge />

		<!-- ⌘K placeholder -->
		<button
			class="action-btn kbd-hint"
			onclick={() => toastStore.show('Command palette kommt in v0.2')}
			title="Command Palette (v0.2)"
			aria-label="Command Palette"
		>
			<kbd>⌘K</kbd>
		</button>

		<!-- Chat toggle -->
		<button
			class="action-btn icon-only"
			class:active={chatStore.open}
			onclick={() => chatStore.toggle()}
			title="Hermes Chat (Ctrl+J)"
			aria-label="Hermes Chat"
		>
			<MessageCircle size={16} />
		</button>

		<!-- Avatar -->
		<div class="avatar-wrap">
			<button
				class="avatar"
				onclick={() => (avatarOpen = !avatarOpen)}
				aria-label="Nutzer-Menü"
				aria-expanded={avatarOpen}
			>
				{initials}
			</button>
			{#if avatarOpen}
				<div class="avatar-menu" role="menu">
					<button role="menuitem" class="menu-item" onclick={openVault}>
						Vault wechseln…
					</button>
					<button role="menuitem" class="menu-item" onclick={openSettings}>
						Einstellungen
					</button>
					<button
						role="menuitem"
						class="menu-item"
						onclick={() => { aboutOpen = true; avatarOpen = false; }}
					>
						Über LIFE Dashboard
					</button>
				</div>
			{/if}
		</div>
	</div>
</header>

<VaultSwitcher open={vaultSwitcherOpen} onclose={() => (vaultSwitcherOpen = false)} />

<!-- About dialog -->
{#if aboutOpen}
	<div
		class="dialog-backdrop"
		role="button"
		tabindex="-1"
		aria-label="Dialog schließen"
		onclick={() => (aboutOpen = false)}
		onkeydown={(e) => e.key === 'Enter' && (aboutOpen = false)}
	>
		<div class="dialog" role="dialog" aria-modal="true" aria-label="Über LIFE Dashboard">
			<h2 class="dialog-title">LIFE Dashboard</h2>
			<p class="dialog-body">Version 0.1 · Phase 4a</p>
			<p class="dialog-body">Persönliches 10-Jahres-Kampagnensystem.</p>
			<button class="dialog-close" onclick={() => (aboutOpen = false)}>Schließen</button>
		</div>
	</div>
{/if}

<style>
	.topbar {
		display: flex;
		align-items: center;
		gap: 0;
		height: 56px;
		padding: 0 16px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-card);
		flex-shrink: 0;
		position: relative;
		z-index: 20;
	}

	/* ── Branding ── */
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		color: var(--color-foreground);
		flex-shrink: 0;
	}
	.mark {
		display: flex;
		align-items: center;
		color: var(--color-lumen, hsl(45 96% 55%));
		flex-shrink: 0;
	}
	.wordmark {
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.01em;
		white-space: nowrap;
	}
	.wordmark-sep {
		color: var(--color-lumen, hsl(45 96% 55%));
	}

	/* ── Breadcrumb ── */
	.breadcrumb {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		font-size: 13px;
		min-width: 0;
		overflow: hidden;
	}
	.crumb-user {
		color: var(--color-muted-foreground);
		white-space: nowrap;
	}
	.crumb-sep {
		color: var(--color-border);
		font-size: 12px;
		user-select: none;
	}
	.crumb-link {
		color: var(--color-foreground);
		text-decoration: none;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 13px;
		padding: 0;
		font-family: inherit;
		white-space: nowrap;
		transition: color 150ms;
	}
	.crumb-link:hover { color: var(--color-lumen, hsl(45 96% 55%)); }
	.crumb-static {
		color: var(--color-muted-foreground);
		white-space: nowrap;
	}

	/* ── Actions ── */
	.actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 5px;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-muted-foreground);
		font-size: 12px;
		font-family: inherit;
		padding: 5px 8px;
		border-radius: 6px;
		transition: background 150ms, color 150ms;
		white-space: nowrap;
	}
	.action-btn:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.action-btn.active {
		color: var(--color-primary);
	}
	.action-btn.icon-only {
		padding: 5px 6px;
	}
	.action-label {
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.04em;
	}
	.fokus-btn.fokus-active {
		background: var(--color-lumen, hsl(45 96% 55%));
		color: hsl(0 0% 10%);
	}
	.fokus-btn.fokus-active:hover {
		background: var(--color-lumen, hsl(45 96% 55%));
		opacity: 0.9;
	}

	/* Sync status */
	.sync-status {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 11px;
		color: var(--color-muted-foreground);
		cursor: default;
	}
	.vault-chip {
		background: none;
		border: none;
		font-family: inherit;
		cursor: pointer;
		transition: background 150ms, color 150ms;
	}
	.vault-chip:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.sync-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
		transition: background 300ms;
	}
	.sync-dot.sync-synced { background: hsl(142 71% 45%); }
	.sync-dot.sync-syncing {
		background: hsl(45 96% 55%);
		animation: pulse-dot 1s ease-in-out infinite;
	}
	.sync-dot.sync-error { background: hsl(0 84% 60%); }
	@keyframes pulse-dot {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}
	.sync-label { white-space: nowrap; }
	.sync-time {
		color: var(--color-muted-foreground);
		opacity: 0.7;
		white-space: nowrap;
	}

	/* ⌘K */
	.kbd-hint kbd {
		font-family: inherit;
		font-size: 11px;
		font-weight: 500;
	}

	/* ── Avatar ── */
	.avatar-backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		background: transparent;
	}
	.avatar-wrap {
		position: relative;
		z-index: 40;
	}
	.avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--color-lumen, hsl(45 96% 55%));
		color: hsl(0 0% 10%);
		font-size: 11px;
		font-weight: 700;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		letter-spacing: 0.03em;
		transition: opacity 150ms;
		flex-shrink: 0;
	}
	.avatar:hover { opacity: 0.85; }

	.avatar-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		box-shadow: 0 4px 16px hsl(0 0% 0% / 0.12);
		min-width: 180px;
		overflow: hidden;
		padding: 4px;
	}
	.menu-item {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 13px;
		font-family: inherit;
		color: var(--color-foreground);
		padding: 7px 10px;
		border-radius: 5px;
		transition: background 150ms;
	}
	.menu-item:hover { background: var(--color-muted); }

	/* ── About dialog ── */
	.dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: hsl(0 0% 0% / 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.dialog {
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		padding: 24px;
		min-width: 280px;
		max-width: 360px;
		box-shadow: 0 8px 32px hsl(0 0% 0% / 0.2);
	}
	.dialog-title {
		font-size: 16px;
		font-weight: 600;
		margin: 0 0 8px;
	}
	.dialog-body {
		font-size: 13px;
		color: var(--color-muted-foreground);
		margin: 0 0 6px;
	}
	.dialog-close {
		margin-top: 16px;
		display: block;
		width: 100%;
		padding: 8px;
		border-radius: 7px;
		border: 1px solid var(--color-border);
		background: none;
		cursor: pointer;
		font-size: 13px;
		font-family: inherit;
		color: var(--color-foreground);
		transition: background 150ms;
	}
	.dialog-close:hover { background: var(--color-muted); }
</style>
