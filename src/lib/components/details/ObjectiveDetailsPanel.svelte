<script lang="ts">
	import type { Objective, ObjectiveStatus } from '$lib/types/campaign.js';
	import { X, ExternalLink } from 'lucide-svelte';

	interface Props {
		objective: Objective | null;
		onClose: () => void;
		onSave: (id: string, patch: { status?: ObjectiveStatus; progress_note?: string; deadline?: string }) => Promise<void>;
	}

	let { objective, onClose, onSave }: Props = $props();

	let localStatus = $state<ObjectiveStatus>('not_started');
	let localNote = $state('');
	let localDeadline = $state('');
	let saving = $state(false);
	let saveError = $state('');

	$effect(() => {
		if (objective) {
			localStatus = objective.status;
			localNote = objective.progress_note ?? '';
			localDeadline = objective.deadline ?? '';
			saveError = '';
		}
	});

	async function handleSave() {
		if (!objective) return;
		saving = true;
		saveError = '';
		try {
			await onSave(objective.id, {
				status: localStatus,
				progress_note: localNote || undefined,
				deadline: localDeadline || undefined
			});
			onClose();
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Fehler beim Speichern';
		} finally {
			saving = false;
		}
	}

	function handleCopyPath() {
		if (!objective) return;
		const num = String(objective.chapter_number).padStart(2, '0');
		const path = `~/Projects/life/_campaign/chapters/${num}-*.md  §  ${objective.id}`;
		navigator.clipboard?.writeText(path).catch(() => {});
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	const historyReversed = $derived(objective?.history ? [...objective.history].reverse() : []);
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if objective}
	<div
		class="fixed inset-0 bg-black/30 z-40"
		onclick={onClose}
		role="presentation"
	></div>

	<aside
		class="fixed right-0 top-0 h-full w-full md:w-[480px] bg-background border-l border-border shadow-xl z-50 flex flex-col"
		onclick={(e) => e.stopPropagation()}
		role="dialog"
		aria-label="Objective Details"
	>
		<header class="flex items-center justify-between border-b border-border px-4 py-3 flex-shrink-0">
			<code class="text-xs text-muted-foreground font-mono">{objective.id}</code>
			<button
				onclick={onClose}
				class="text-muted-foreground hover:text-foreground transition-colors p-1"
				aria-label="Schliessen"
			>
				<X size={18} />
			</button>
		</header>

		<div class="flex-1 overflow-y-auto p-4 space-y-5">
			<h2 class="text-lg font-semibold leading-snug">{objective.title}</h2>

			<!-- Status + Deadline -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="text-xs text-muted-foreground mb-1 block" for="detail-status">Status</label>
					<select
						id="detail-status"
						bind:value={localStatus}
						class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
					>
						<option value="todo">todo</option>
						<option value="not_started">not_started</option>
						<option value="in_progress">in_progress</option>
						<option value="blocked">blocked</option>
						<option value="done">done</option>
						<option value="archived">archived</option>
					</select>
				</div>
				<div>
					<label class="text-xs text-muted-foreground mb-1 block" for="detail-deadline">Deadline</label>
					<input
						id="detail-deadline"
						type="date"
						bind:value={localDeadline}
						class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
					/>
				</div>
			</div>

			<!-- Meta -->
			<div class="text-xs text-muted-foreground space-y-0.5">
				<div>Weight: {objective.weight} · Kapitel: {objective.chapter_number}</div>
				{#if objective.related_goals.length > 0}
					<div>Goals: {objective.related_goals.join(', ')}</div>
				{/if}
				{#if objective.completed_at}
					<div>Abgeschlossen: {objective.completed_at}</div>
				{/if}
			</div>

			<!-- Threshold (read-only) -->
			<div>
				<p class="text-xs text-muted-foreground mb-1">Threshold</p>
				<div class="text-sm p-3 bg-muted/30 rounded-md border border-border leading-relaxed">
					{objective.threshold}
				</div>
			</div>

			<!-- Progress Note -->
			<div>
				<label class="text-xs text-muted-foreground mb-1 block" for="detail-note">Progress Note</label>
				<textarea
					id="detail-note"
					bind:value={localNote}
					rows={4}
					placeholder="Aktueller Stand, nächste Schritte, Blocker..."
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono
						placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
				></textarea>
			</div>

			<!-- History -->
			{#if historyReversed.length > 0}
				<div>
					<p class="text-xs text-muted-foreground mb-2">History</p>
					<ul class="space-y-1">
						{#each historyReversed as entry}
							<li class="text-xs text-muted-foreground font-mono">
								· {entry.timestamp} · {entry.change}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		{#if saveError}
			<div class="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-200">
				{saveError}
			</div>
		{/if}

		<footer class="border-t border-border p-4 flex gap-2 flex-shrink-0">
			<button
				onclick={handleCopyPath}
				class="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-border
					bg-background px-3 py-2 text-sm hover:bg-accent transition-colors"
			>
				<ExternalLink size={14} />
				Pfad kopieren
			</button>
			<button
				onclick={handleSave}
				disabled={saving}
				class="flex-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground
					hover:bg-primary/90 disabled:opacity-50 transition-colors"
			>
				{saving ? 'Speichert...' : 'Speichern'}
			</button>
		</footer>
	</aside>
{/if}
