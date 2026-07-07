<script lang="ts">
	import { Loader2, FolderOpen, Check } from 'lucide-svelte';
	import type { VaultListEntry } from '$lib/types/vault.js';
	import { toastStore } from '$lib/stores/toast.svelte.js';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open, onclose }: Props = $props();

	const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

	let loading = $state(false);
	let switching = $state<string | null>(null);
	let errorMsg = $state('');
	let activePath = $state('');
	let vaults = $state<VaultListEntry[]>([]);

	const activeVault = $derived(vaults.find((v) => v.active) ?? null);
	const otherVaults = $derived(vaults.filter((v) => !v.active && v.exists));

	function actLabel(n: number | null): string {
		if (!n) return '—';
		return `Akt ${ROMAN[n] ?? n}`;
	}

	async function loadVaults() {
		loading = true;
		errorMsg = '';
		try {
			const res = await fetch('/api/vaults');
			const data = await res.json();
			if (!res.ok) throw new Error(data.message ?? 'Vault-Liste nicht ladbar');
			activePath = data.active ?? '';
			vaults = data.vaults ?? [];
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Unbekannter Fehler';
		} finally {
			loading = false;
		}
	}

	async function switchTo(path: string) {
		if (switching || path === activePath) return;
		switching = path;
		errorMsg = '';
		// Close modal first — backdrop blocks all UI if navigation stalls (e.g. Vite restart).
		onclose();
		try {
			if (typeof localStorage !== 'undefined') {
				localStorage.removeItem('folio-chat');
			}
			const res = await fetch('/api/vaults/switch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ vaultPath: path })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.message ?? 'Vault-Wechsel fehlgeschlagen');
			// Hard navigation — resets all module singletons (campaignStore, chat, layout).
			window.location.replace('/vault');
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unbekannter Fehler';
			toastStore.show(`Vault-Wechsel fehlgeschlagen: ${msg}`);
			switching = null;
		}
	}

	$effect(() => {
		if (open) loadVaults();
	});
</script>

{#if open}
	<div
		class="backdrop"
		role="button"
		tabindex="-1"
		aria-label="Vault-Auswahl schließen"
		onclick={onclose}
		onkeydown={(e) => e.key === 'Enter' && onclose()}
	></div>
	<div class="dialog" role="dialog" aria-modal="true" aria-label="Vault wechseln">
		<header class="dialog-head">
			<h2 class="dialog-title">Vault &amp; Kampagne</h2>
			<button type="button" class="close-btn" onclick={onclose} aria-label="Schließen">×</button>
		</header>

		{#if loading}
			<div class="state-row">
				<Loader2 size={16} class="spin" />
				<span>Vaults laden…</span>
			</div>
		{:else if errorMsg && !vaults.length}
			<p class="error">{errorMsg}</p>
		{:else}
			{#if activeVault}
				<section class="section">
					<h3 class="section-label">Aktiv</h3>
					<div class="vault-card active-card">
						<div class="card-top">
							<span class="vault-title">{activeVault.title}</span>
							<span class="badge-active"><Check size={12} /> aktiv</span>
						</div>
						<p class="vault-path" title={activeVault.path}>{activeVault.path}</p>
						<p class="vault-meta">
							{actLabel(activeVault.currentAct)} · Kapitel {activeVault.currentChapter ?? '—'}
							{#if activeVault.updated}
								· aktualisiert {activeVault.updated}
							{/if}
						</p>
					</div>
				</section>
			{/if}

			{#if otherVaults.length}
				<section class="section">
					<h3 class="section-label">Weitere Vaults</h3>
					<ul class="vault-list">
						{#each otherVaults as vault (vault.path)}
							<li class="vault-card">
								<div class="card-top">
									<span class="vault-title">{vault.title}</span>
									<button
										type="button"
										class="switch-btn"
										disabled={!!switching}
										onclick={() => switchTo(vault.path)}
									>
										{#if switching === vault.path}
											<Loader2 size={14} class="spin" />
										{:else}
											Wechseln
										{/if}
									</button>
								</div>
								<p class="vault-path" title={vault.path}>{vault.path}</p>
								<p class="vault-meta">
									{actLabel(vault.currentAct)} · Kapitel {vault.currentChapter ?? '—'}
									{#if vault.updated}
										· aktualisiert {vault.updated}
									{/if}
								</p>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if errorMsg}
				<p class="error">{errorMsg}</p>
			{/if}
		{/if}

		<footer class="dialog-foot">
			<a href="/setup/existing" class="link-btn" onclick={onclose}>
				<FolderOpen size={14} />
				Anderen Vault einbinden…
			</a>
		</footer>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: hsl(0 0% 0% / 0.45);
	}

	.dialog {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 70;
		width: min(520px, calc(100vw - 32px));
		max-height: min(80vh, 640px);
		overflow: auto;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		box-shadow: 0 12px 40px hsl(0 0% 0% / 0.2);
		padding: 0;
	}

	.dialog-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 18px 12px;
		border-bottom: 1px solid var(--color-border);
	}

	.dialog-title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
		color: var(--color-muted-foreground);
		padding: 2px 6px;
		border-radius: 6px;
	}
	.close-btn:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}

	.section {
		padding: 14px 18px 0;
	}
	.section-label {
		margin: 0 0 8px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
	}

	.vault-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.vault-card {
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 10px 12px;
		background: var(--color-background);
	}

	.active-card {
		border-color: hsl(142 71% 45% / 0.5);
		background: hsl(142 71% 45% / 0.06);
	}

	.card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.vault-title {
		font-size: 14px;
		font-weight: 600;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.badge-active {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: hsl(142 71% 35%);
		flex-shrink: 0;
	}

	.vault-path {
		margin: 4px 0 0;
		font-size: 11px;
		color: var(--color-muted-foreground);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vault-meta {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--color-muted-foreground);
	}

	.switch-btn {
		flex-shrink: 0;
		font-size: 12px;
		padding: 4px 10px;
		border-radius: 6px;
		border: 1px solid var(--color-border);
		background: var(--color-card);
		cursor: pointer;
		font-family: inherit;
		color: var(--color-foreground);
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.switch-btn:hover:not(:disabled) {
		background: var(--color-muted);
	}
	.switch-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.dialog-foot {
		padding: 14px 18px 16px;
		border-top: 1px solid var(--color-border);
		margin-top: 14px;
	}

	.link-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--color-foreground);
		text-decoration: none;
	}
	.link-btn:hover {
		color: var(--color-lumen, hsl(45 96% 55%));
	}

	.state-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 24px 18px;
		font-size: 13px;
		color: var(--color-muted-foreground);
	}

	.error {
		margin: 12px 18px 0;
		font-size: 13px;
		color: hsl(0 84% 50%);
	}

	:global(.spin) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
