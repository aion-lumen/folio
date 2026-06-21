<!--
  2026-06-07 TweaksPanel: floating Toggle rechts unten.
  Klein (48x48 Icon), expand zu kleinem Panel mit Fluss/Werkbank-Toggle.
  State via localStorage persistiert (key: pipeline.view).
-->
<script lang="ts">
	import type { PipelineView } from './types.js';

	let { view, onChange }: { view: PipelineView; onChange: (v: PipelineView) => void } = $props();

	let open = $state(false);
</script>

<div class="tweaks">
	{#if open}
		<div class="panel">
			<div class="head">
				<span>View</span>
				<button type="button" class="x" onclick={() => (open = false)} aria-label="Schliessen">×</button>
			</div>
			<div class="opts">
				<label class="opt" class:active={view === 'fluss'}>
					<input type="radio" name="view" value="fluss" checked={view === 'fluss'} onchange={() => onChange('fluss')} />
					<span>Fluss</span>
				</label>
				<label class="opt" class:active={view === 'werkbank'}>
					<input type="radio" name="view" value="werkbank" checked={view === 'werkbank'} onchange={() => onChange('werkbank')} />
					<span>Werkbank</span>
				</label>
			</div>
		</div>
	{/if}
	<button type="button" class="trigger" onclick={() => (open = !open)} aria-label="Tweaks">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<circle cx="12" cy="12" r="3" />
			<path d="M12 1v6m0 10v6m11-11h-6m-10 0H1m17.6-7.6l-4.2 4.2M9.6 14.4l-4.2 4.2m13.2 0l-4.2-4.2M9.6 9.6l-4.2-4.2" />
		</svg>
	</button>
</div>

<style>
	.tweaks {
		position: fixed;
		bottom: 18px;
		right: 18px;
		z-index: 50;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
	}
	.trigger {
		width: 44px;
		height: 44px;
		border-radius: 999px;
		background: white;
		border: 1px solid hsl(214 25% 88%);
		color: hsl(215 16% 35%);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
	}
	.trigger:hover {
		color: hsl(222 47% 11%);
		border-color: hsl(215 16% 60%);
	}
	.panel {
		background: white;
		border: 1px solid hsl(214 25% 88%);
		border-radius: 10px;
		padding: 12px;
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.1);
		min-width: 200px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
		margin-bottom: 8px;
	}
	.x {
		background: transparent;
		border: 0;
		font-size: 18px;
		color: hsl(215 16% 60%);
		cursor: pointer;
		line-height: 1;
	}
	.opts {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.opt {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 13px;
		color: hsl(222 47% 25%);
	}
	.opt:hover {
		background: hsl(214 28% 96%);
	}
	.opt.active {
		background: hsl(217 70% 95%);
		color: hsl(217 80% 32%);
		font-weight: 500;
	}
	.opt input {
		accent-color: hsl(217 80% 52%);
	}
</style>
