<script lang="ts">
	import { Map, Target, FolderOpen } from 'lucide-svelte';
</script>

<div class="min-h-screen bg-background flex items-center justify-center p-4">
	<div class="w-full max-w-md space-y-8">
		<div class="text-center">
			<h1 class="text-3xl font-bold tracking-tight">LIFE Dashboard</h1>
			<p class="text-muted-foreground mt-2 text-sm">
				Lokales Dashboard für persönliche Lebensplanung mit AI-Agent.
			</p>
		</div>

		<div class="rounded-lg border border-border bg-card p-6 space-y-4">
			<h2 class="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
				Wie möchtest du starten?
			</h2>

			<a
				href="/setup/demo"
				class="flex items-start gap-4 rounded-lg border border-border p-4 hover:bg-accent transition-colors group"
			>
				<div class="mt-0.5 text-green-600"><Map size={20} /></div>
				<div>
					<div class="font-medium">🌱 Mit Demo-Vault starten</div>
					<div class="text-sm text-muted-foreground mt-0.5">
						Beispiel-Kampagne laden und das Dashboard sofort erleben.
						Persona: Alex, 38, plant Neustart.
					</div>
				</div>
			</a>

			<a
				href="/setup/existing"
				class="flex items-start gap-4 rounded-lg border border-border p-4 hover:bg-accent transition-colors group"
			>
				<div class="mt-0.5 text-blue-600"><FolderOpen size={20} /></div>
				<div>
					<div class="font-medium">📂 Bestehenden Vault einbinden</div>
					<div class="text-sm text-muted-foreground mt-0.5">
						Du hast bereits eine Kampagne im Markdown-Format — Pfad angeben und loslegen.
					</div>
				</div>
			</a>

			<div class="flex items-start gap-4 rounded-lg border border-border border-dashed p-4 opacity-50 cursor-not-allowed">
				<div class="mt-0.5 text-purple-600"><Target size={20} /></div>
				<div>
					<div class="font-medium">🎯 Eigene Kampagne aufbauen</div>
					<div class="text-sm text-muted-foreground mt-0.5">
						Hermes-Interview startet eine neue Kampagne von Grund auf.
						<span class="italic">(kommt in v0.2)</span>
					</div>
				</div>
			</div>
		</div>

		<div class="text-center text-xs text-muted-foreground space-y-1">
			<p>Benötigt: Hermes Agent v0.9.0+ · Ollama oder Cloud-LLM</p>
		</div>
	</div>
</div>
