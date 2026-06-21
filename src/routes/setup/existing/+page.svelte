<script lang="ts">
	import { Loader2 } from 'lucide-svelte';

	let vaultPath = $state('');
	let loading = $state(false);
	let errorMsg = $state('');

	async function handleSubmit() {
		if (!vaultPath.trim()) return;
		loading = true;
		errorMsg = '';
		try {
			const res = await fetch('/setup/existing', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ vaultPath: vaultPath.trim() })
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
			loading = false;
		}
	}
</script>

<div class="min-h-screen bg-background flex items-center justify-center p-4">
	<div class="w-full max-w-md space-y-6">
		<div class="text-center">
			<h1 class="text-2xl font-bold">Bestehenden Vault einbinden</h1>
			<p class="text-muted-foreground mt-2 text-sm">
				Pfad zum Vault-Verzeichnis (muss <code class="text-xs bg-muted px-1 rounded">_campaign/campaign.md</code> enthalten).
			</p>
		</div>

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
			<div>
				<label for="vault-path" class="text-xs text-muted-foreground mb-1 block">Vault-Pfad</label>
				<input
					id="vault-path"
					type="text"
					bind:value={vaultPath}
					placeholder="/home/user/Projects/life"
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
						placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				/>
				<p class="text-xs text-muted-foreground mt-1">
					Auch <code>~</code>-Pfade werden unterstützt.
				</p>
			</div>

			{#if errorMsg}
				<div class="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
					{errorMsg}
				</div>
			{/if}

			<div class="flex gap-3">
				<a
					href="/setup"
					class="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm text-center hover:bg-accent transition-colors"
				>
					Zurück
				</a>
				<button
					type="submit"
					disabled={loading || !vaultPath.trim()}
					class="flex-1 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground
						hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
				>
					{#if loading}<Loader2 size={14} class="animate-spin" />{/if}
					{loading ? 'Prüfe...' : 'Einbinden'}
				</button>
			</div>
		</form>
	</div>
</div>
