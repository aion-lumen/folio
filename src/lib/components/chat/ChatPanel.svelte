<script lang="ts">
	import { chatStore } from '$lib/stores/chat.svelte.js';
	import { chatPanelStore } from '$lib/stores/chatPanel.svelte.js';
	import { selectionStore } from '$lib/stores/selection.svelte.js';
	import { campaignStore } from '$lib/stores/campaign.svelte.js';
	import MessageList from './MessageList.svelte';
	import ContextIndicator from './ContextIndicator.svelte';
	import ModelSwitcher from './ModelSwitcher.svelte';
	import { X, Send, Trash2, ChevronLeft, ChevronRight } from 'lucide-svelte';

	let input = $state('');

	const collapsed = $derived(chatPanelStore.collapsed);
	const selectedObjectives = $derived(selectionStore.getSelected(campaignStore.allObjectives));

	async function handleSubmit() {
		const msg = input.trim();
		if (!msg) return;
		input = '';
		await chatStore.send(msg, Array.from(selectionStore.selectedIds));
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	}
</script>

{#if collapsed}
	<!-- Icon strip when collapsed -->
	<div class="strip">
		<button
			class="strip-toggle"
			onclick={() => chatPanelStore.toggleCollapse()}
			title="Hermes öffnen (Ctrl+J)"
		>
			<ChevronRight size={16} />
		</button>
		<div class="strip-dot" title="Hermes · lokal"></div>
	</div>
{:else}
	<!-- Full panel -->
	<div class="panel">
		<div class="panel-head">
			<button
				class="collapse-btn"
				onclick={() => chatPanelStore.toggleCollapse()}
				title="Einklappen (Ctrl+J)"
			>
				<ChevronLeft size={14} />
			</button>
			<div class="head-info">
				<p class="head-title">Hermes</p>
				<ContextIndicator />
				<ModelSwitcher />
			</div>
			<div class="head-actions">
				<button
					onclick={() => chatStore.newChat()}
					title="Neuer Chat (setzt auch den Server-Verlauf zurück)"
					class="icon-btn"
				>
					<Trash2 size={14} />
				</button>
				<button onclick={() => chatStore.toggle()} class="icon-btn" title="Schließen">
					<X size={16} />
				</button>
			</div>
		</div>

		<div class="messages">
			<MessageList />
		</div>

		{#if selectedObjectives.length > 0}
			<div class="selection-bar">
				<div class="sel-row">
					<span class="sel-label">📌 Ausgewählt ({selectedObjectives.length})</span>
					<button
						onclick={() => selectionStore.clear()}
						class="sel-clear"
					>
						Löschen
					</button>
				</div>
				{#each selectedObjectives.slice(0, 3) as obj}
					<div class="sel-item">• {obj.id} {obj.title}</div>
				{/each}
				{#if selectedObjectives.length > 3}
					<div class="sel-item sel-more">und {selectedObjectives.length - 3} weitere</div>
				{/if}
			</div>
		{/if}

		<div class="compose">
			<div class="compose-inner">
				<textarea
					bind:value={input}
					onkeydown={handleKeydown}
					placeholder="Frage an Hermes..."
					rows={2}
					disabled={chatStore.loading}
					class="compose-input"
				></textarea>
				<button
					onclick={handleSubmit}
					disabled={chatStore.loading || !input.trim()}
					class="send-btn"
				>
					<Send size={16} />
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ── Collapsed strip ── */
	.strip {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 12px;
		gap: 12px;
		border-left: 1px solid var(--color-border);
		background: var(--color-card);
	}
	.strip-toggle {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-muted-foreground);
		padding: 6px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		transition: background 150ms, color 150ms;
	}
	.strip-toggle:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.strip-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: hsl(142 71% 45%);
		box-shadow: 0 0 0 3px hsl(138 76% 95%);
	}

	/* ── Full panel ── */
	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		border-left: 1px solid var(--color-border);
		background: var(--color-card);
		min-width: 0;
	}

	.panel-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}
	.collapse-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-muted-foreground);
		padding: 4px;
		border-radius: 5px;
		display: flex;
		align-items: center;
		flex-shrink: 0;
		transition: background 150ms, color 150ms;
	}
	.collapse-btn:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.head-info {
		flex: 1;
		min-width: 0;
	}
	.head-title {
		font-size: 13px;
		font-weight: 600;
		margin: 0;
	}
	.head-actions {
		display: flex;
		gap: 2px;
		flex-shrink: 0;
	}
	.icon-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-muted-foreground);
		padding: 4px;
		border-radius: 5px;
		display: flex;
		align-items: center;
		transition: color 150ms;
	}
	.icon-btn:hover {
		color: var(--color-foreground);
	}

	.messages {
		flex: 1;
		overflow: hidden;
	}

	.selection-bar {
		border-top: 1px solid var(--color-border);
		background: hsl(210 40% 98%);
		padding: 8px 12px;
		flex-shrink: 0;
	}
	.sel-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}
	.sel-label {
		font-size: 11px;
		font-weight: 500;
		color: var(--color-foreground);
	}
	.sel-clear {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 11px;
		color: var(--color-muted-foreground);
		padding: 0;
		transition: color 150ms;
	}
	.sel-clear:hover { color: var(--color-foreground); }
	.sel-item {
		font-size: 11px;
		color: var(--color-muted-foreground);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sel-more { font-style: italic; }

	.compose {
		border-top: 1px solid var(--color-border);
		padding: 10px;
		flex-shrink: 0;
	}
	.compose-inner {
		display: flex;
		gap: 8px;
	}
	.compose-input {
		flex: 1;
		resize: none;
		border-radius: 8px;
		border: 1px solid var(--color-input);
		background: var(--color-background);
		padding: 8px 10px;
		font-size: 13px;
		font-family: inherit;
		color: var(--color-foreground);
		min-width: 0;
	}
	.compose-input::placeholder { color: var(--color-muted-foreground); }
	.compose-input:focus { outline: none; box-shadow: 0 0 0 1px var(--color-ring); }
	.compose-input:disabled { opacity: 0.5; }
	.send-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		background: var(--color-primary);
		color: var(--color-primary-foreground);
		border: none;
		padding: 8px;
		cursor: pointer;
		align-self: flex-end;
		transition: opacity 150ms;
		flex-shrink: 0;
	}
	.send-btn:disabled { opacity: 0.5; cursor: default; }
	.send-btn:not(:disabled):hover { opacity: 0.9; }
</style>
