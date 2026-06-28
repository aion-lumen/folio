<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { enhance } from '$app/forms';

	let { form } = $props();
	let loading = $state(false);
</script>

<div class="min-h-screen bg-background flex items-center justify-center p-4">
	<div class="w-full max-w-md space-y-6">
		<div class="text-center">
			<h1 class="text-2xl font-bold">Demo-Vault</h1>
			<p class="text-muted-foreground mt-2 text-sm">
				Erstellt <code class="text-xs bg-muted px-1 rounded">/Users/Shared/folio-demo/</code> mit
				einer Beispiel-Kampagne.
			</p>
		</div>

		<div class="rounded-lg border border-border bg-card p-5 space-y-3 text-sm">
			<p class="font-medium">Persona: Alex, 38</p>
			<ul class="text-muted-foreground space-y-1 text-xs">
				<li>• Akt I: Neustart in Portugal — 2 Kapitel, 9 Objectives</li>
				<li>• Karriere-Pivot, Wohnungs-Suche, Sprachlernziele</li>
				<li>• Alle Akt-Bilder als Platzhalter</li>
			</ul>
		</div>

		{#if form?.message}
			<div class="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
				{form.message}
			</div>
		{/if}

		<div class="flex gap-3">
			<a
				href="/setup"
				class="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm text-center hover:bg-accent transition-colors"
			>
				Zurück
			</a>
			<form
				method="POST"
				class="flex-1"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						await update();
						loading = false;
					};
				}}
			>
				<button
					type="submit"
					disabled={loading}
					class="w-full rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground
						hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
				>
					{#if loading}<Loader2 size={14} class="animate-spin" />{/if}
					{loading ? 'Erstelle...' : 'Demo starten'}
				</button>
			</form>
		</div>
	</div>
</div>
