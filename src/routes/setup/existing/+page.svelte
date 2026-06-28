<script lang="ts">
	import { Loader2, Folder, FolderUp, Check, ChevronRight } from 'lucide-svelte';
	import { onMount } from 'svelte';

	interface Entry {
		name: string;
		path: string;
		isVault: boolean;
	}

	// Directory-browser state (the primary, robust way to pick a vault).
	let currentPath = $state('');
	let parent = $state<string | null>(null);
	let currentIsVault = $state(false);
	let entries = $state<Entry[]>([]);
	let browsing = $state(false);
	let browseError = $state('');

	// Manual-entry fallback (kept for power users / paths not easily browsed to).
	let manualMode = $state(false);
	let vaultPath = $state('');

	// Submit state.
	let submitting = $state(false);
	let errorMsg = $state('');

	async function browse(path?: string) {
		browsing = true;
		browseError = '';
		try {
			const qs = path ? `?path=${encodeURIComponent(path)}` : '';
			const res = await fetch(`/setup/browse${qs}`);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				browseError = data.message ?? 'Verzeichnis nicht lesbar';
				return;
			}
			currentPath = data.path;
			parent = data.parent;
			currentIsVault = data.isVault;
			entries = data.entries;
		} catch (e) {
			browseError = e instanceof Error ? e.message : 'Unbekannter Fehler';
		} finally {
			browsing = false;
		}
	}

	async function submit(path: string) {
		if (!path.trim()) return;
		submitting = true;
		errorMsg = '';
		try {
			const res = await fetch('/setup/existing', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ vaultPath: path.trim() })
			});
			if (res.redirected) {
				window.location.href = res.url;
				return;
			}
			const data = await res.json().catch(() => ({}));
			if (!res.ok) errorMsg = data.message ?? 'Fehler beim Einbinden';
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Unbekannter Fehler';
		} finally {
			submitting = false;
		}
	}

	onMount(() => browse());
</script>

<div class="min-h-screen bg-background flex items-center justify-center p-4">
	<div class="w-full max-w-lg space-y-6">
		<div class="text-center">
			<h1 class="text-2xl font-bold">Bestehenden Vault einbinden</h1>
			<p class="text-muted-foreground mt-2 text-sm">
				Wähle das Vault-Verzeichnis (muss
				<code class="text-xs bg-muted px-1 rounded">_campaign/campaign.md</code> enthalten).
			</p>
		</div>

		{#if !manualMode}
			<!-- Directory browser -->
			<div class="rounded-md border border-border overflow-hidden">
				<div class="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
					<button
						type="button"
						onclick={() => parent && browse(parent)}
						disabled={!parent || browsing}
						class="rounded p-1 hover:bg-accent disabled:opacity-40 transition-colors"
						title="Übergeordneter Ordner"
						aria-label="Übergeordneter Ordner"
					>
						<FolderUp size={16} />
					</button>
					<span class="text-xs text-muted-foreground truncate flex-1" title={currentPath}>
						{currentPath || '…'}
					</span>
					{#if browsing}<Loader2 size={14} class="animate-spin text-muted-foreground" />{/if}
				</div>

				<div class="max-h-64 overflow-y-auto">
					{#if browseError}
						<div class="p-3 text-sm text-red-700">{browseError}</div>
					{:else if entries.length === 0}
						<div class="p-3 text-sm text-muted-foreground">Keine Unterordner.</div>
					{:else}
						{#each entries as entry (entry.path)}
							<div class="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50 group">
								<button
									type="button"
									onclick={() => browse(entry.path)}
									class="flex items-center gap-2 flex-1 text-left text-sm min-w-0"
								>
									<Folder size={15} class="text-muted-foreground shrink-0" />
									<span class="truncate">{entry.name}</span>
									{#if entry.isVault}
										<span
											class="text-[10px] rounded bg-green-100 text-green-700 px-1.5 py-0.5 shrink-0"
											>Vault</span
										>
									{/if}
									<ChevronRight
										size={14}
										class="text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100"
									/>
								</button>
								{#if entry.isVault}
									<button
										type="button"
										onclick={() => submit(entry.path)}
										disabled={submitting}
										class="text-xs rounded bg-primary px-2 py-1 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
									>
										Verwenden
									</button>
								{/if}
							</div>
						{/each}
					{/if}
				</div>

				<!-- Use the folder currently open (handy when you've navigated INTO the vault) -->
				<div class="border-t border-border px-3 py-2">
					<button
						type="button"
						onclick={() => submit(currentPath)}
						disabled={submitting || !currentPath}
						class="w-full rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground
							hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
					>
						{#if submitting}<Loader2 size={14} class="animate-spin" />{:else if currentIsVault}<Check
								size={14}
							/>{/if}
						Diesen Ordner verwenden
						{#if currentIsVault}<span class="text-[10px] opacity-80">(Vault erkannt)</span>{/if}
					</button>
				</div>
			</div>
		{:else}
			<!-- Manual-entry fallback -->
			<form
				onsubmit={(e) => {
					e.preventDefault();
					submit(vaultPath);
				}}
				class="space-y-2"
			>
				<label for="vault-path" class="text-xs text-muted-foreground block">Vault-Pfad</label>
				<input
					id="vault-path"
					type="text"
					bind:value={vaultPath}
					placeholder="/home/user/Projects/life"
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
						placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				/>
				<p class="text-xs text-muted-foreground">Auch <code>~</code>-Pfade werden unterstützt.</p>
				<button
					type="submit"
					disabled={submitting || !vaultPath.trim()}
					class="w-full rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground
						hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
				>
					{#if submitting}<Loader2 size={14} class="animate-spin" />{/if}
					{submitting ? 'Prüfe...' : 'Einbinden'}
				</button>
			</form>
		{/if}

		{#if errorMsg}
			<div class="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
				{errorMsg}
			</div>
		{/if}

		<div class="flex items-center justify-between">
			<a href="/setup" class="text-xs text-muted-foreground hover:text-foreground transition-colors">
				← Zurück
			</a>
			<button
				type="button"
				onclick={() => (manualMode = !manualMode)}
				class="text-xs text-muted-foreground hover:text-foreground transition-colors"
			>
				{manualMode ? 'Ordner durchsuchen' : 'Pfad manuell eingeben'}
			</button>
		</div>
	</div>
</div>
