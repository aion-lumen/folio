<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ActivityBar from './ActivityBar.svelte';
	import Sidebar from './Sidebar.svelte';
	import Header from './Header.svelte';
	import ChatPanel from '../chat/ChatPanel.svelte';
	import { chatStore } from '$lib/stores/chat.svelte.js';
	import { chatPanelStore } from '$lib/stores/chatPanel.svelte.js';
	import { layoutStore } from '$lib/stores/layout.svelte.js';
	import { leuchtfeuerStore } from '$lib/stores/leuchtfeuer.svelte.js';
	import { toastStore } from '$lib/stores/toast.svelte.js';

	// F.9 Block-3 Quick-Fix: Vault-Sidebar (Kampagnen/Kapitel-Nav) nur auf /vault sichtbar.
	// Block 6 ersetzt das durch echte ContextSidebar mit Mail-/Pipeline-/Heute-Varianten.
	const isVaultRoute = $derived(page.url.pathname.startsWith('/vault'));

	// Council-Mobile 1a (2026-05-30): Mobile-Routes laufen ohne AppShell-Chrome
	// (ActivityBar, Sidebar, Header, ChatPanel). Eigene MobileTabBar im Mobile-Layout.
	const isMobileRoute = $derived(page.url.pathname.startsWith('/council/mobile'));

	let { children } = $props();

	let isResizing = $state(false);

	onMount(() => {
		chatPanelStore.init();
		leuchtfeuerStore.load();
	});

	function startResize(e: MouseEvent) {
		isResizing = true;
		e.preventDefault();
	}

	function onMouseMove(e: MouseEvent) {
		if (!isResizing) return;
		const newWidth = window.innerWidth - e.clientX;
		chatPanelStore.setWidth(Math.max(320, Math.min(window.innerWidth * 0.5, newWidth)));
	}

	function onMouseUp() {
		if (isResizing) isResizing = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && layoutStore.focusMode) {
			layoutStore.exitFocus();
			return;
		}
		if (e.key === 'j' && (e.metaKey || e.ctrlKey) && chatStore.open) {
			e.preventDefault();
			chatPanelStore.toggleCollapse();
		}
	}

	const chatVisible = $derived(chatStore.open);
	const panelWidth = $derived(chatPanelStore.collapsed ? 48 : chatPanelStore.width);
	const focusMode = $derived(layoutStore.focusMode);
</script>

<svelte:window onmousemove={onMouseMove} onmouseup={onMouseUp} onkeydown={onKeydown} />

{#if isMobileRoute}
	<!-- Council-Mobile 1a: kein AppShell-Chrome — Layout-Wrapper kommt aus mobile/+layout.svelte -->
	{@render children()}
{:else}
	<div class="shell" class:resizing={isResizing} class:focus-mode={focusMode}>
		<!-- F.9 Block-1: ActivityBar bleibt auch in focus-mode sichtbar (Workspace-Navigation
		     bleibt zugänglich; Sidebar+Header werden ausgeblendet wie bisher).
		     F.9 Block-3 Quick-Fix: Vault-Sidebar nur auf /vault — Block 6 ersetzt durch ContextSidebar. -->
		<ActivityBar />
		{#if !focusMode && isVaultRoute}
			<Sidebar />
		{/if}

		<div class="content">
			{#if !focusMode}
				<Header />
			{/if}
			<main class="main-area">
				{@render children()}
			</main>
		</div>

		{#if chatVisible}
			<div
				class="resize-handle"
				class:active={isResizing}
				onmousedown={startResize}
				role="separator"
				aria-orientation="vertical"
				aria-label="Chat-Breite anpassen"
			></div>
			<div
				class="chat-wrapper"
				style="width: {panelWidth}px; transition: {isResizing ? 'none' : 'width 200ms ease-out'}"
			>
				<ChatPanel />
			</div>
		{/if}
	</div>
{/if}

<!-- Toast — F.8 BUG-I3: sticky-Mode mit Dismiss-X für Run-Summary -->
{#if toastStore.message}
	<div class="toast" role="status" aria-live="polite">
		<span>{toastStore.message}</span>
		{#if toastStore.sticky}
			<button
				type="button"
				class="toast-dismiss"
				aria-label="Schliessen"
				onclick={() => toastStore.dismiss()}
			>×</button>
		{/if}
	</div>
{/if}

<style>
	.shell {
		display: flex;
		height: 100vh;
		overflow: hidden;
		background: var(--color-background);
		color: var(--color-foreground);
	}
	.shell.resizing {
		user-select: none;
		cursor: col-resize;
	}

	.content {
		display: flex;
		flex: 1;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	.main-area {
		flex: 1;
		overflow: auto;
		padding: 1rem;
	}
	@media (min-width: 768px) {
		.main-area {
			padding: 1.5rem;
		}
	}

	.resize-handle {
		flex-shrink: 0;
		width: 4px;
		background: var(--color-border);
		cursor: col-resize;
		transition: background 150ms, width 150ms;
		position: relative;
		z-index: 10;
	}
	.resize-handle:hover,
	.resize-handle.active {
		width: 5px;
		background: var(--color-lumen);
	}

	.chat-wrapper {
		flex-shrink: 0;
		height: 100%;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	/* ── Toast ── */
	.toast {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--color-foreground);
		color: var(--color-background);
		padding: 8px 16px;
		border-radius: 8px;
		font-size: 13px;
		box-shadow: 0 4px 16px hsl(0 0% 0% / 0.2);
		z-index: 100;
		white-space: nowrap;
		pointer-events: auto;
		animation: toast-in 150ms ease-out;
		display: inline-flex;
		align-items: center;
		gap: 12px;
	}
	.toast-dismiss {
		background: transparent;
		border: 0;
		color: inherit;
		font-size: 18px;
		line-height: 1;
		opacity: 0.7;
		cursor: pointer;
		padding: 0 2px;
	}
	.toast-dismiss:hover {
		opacity: 1;
	}
	@keyframes toast-in {
		from { opacity: 0; transform: translateX(-50%) translateY(6px); }
		to   { opacity: 1; transform: translateX(-50%) translateY(0); }
	}
</style>
