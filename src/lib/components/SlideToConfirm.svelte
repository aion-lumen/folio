<script lang="ts">
	import { Check, ChevronRight, LoaderCircle } from 'lucide-svelte';

	let {
		label,
		hint = 'Nach rechts ziehen',
		disabled = false,
		busy = false,
		resetKey = '',
		onconfirm
	}: {
		label: string;
		hint?: string;
		disabled?: boolean;
		busy?: boolean;
		resetKey?: string;
		onconfirm: () => void | Promise<void>;
	} = $props();

	let track: HTMLDivElement;
	let progress = $state(0);
	let dragging = $state(false);
	let startX = 0;
	let startPixels = 0;
	let keyboardActive = false;
	let confirming = $state(false);
	const locked = $derived(disabled || busy || confirming);
	const ready = $derived(progress === 100);

	$effect(() => {
		resetKey;
		progress = 0;
		dragging = false;
		keyboardActive = false;
	});

	function usableWidth(): number {
		return Math.max(1, track.getBoundingClientRect().width - 52);
	}

	function reset() {
		progress = 0;
		dragging = false;
		keyboardActive = false;
	}

	function pointerDown(event: PointerEvent) {
		if (locked || event.button !== 0) return;
		const rect = track.getBoundingClientRect();
		const thumbCenter = 26 + (progress / 100) * usableWidth();
		const localX = event.clientX - rect.left;
		// A tap at the far end must never count as a deliberate confirmation.
		if (Math.abs(localX - thumbCenter) > 34) return;
		dragging = true;
		startX = event.clientX;
		startPixels = (progress / 100) * usableWidth();
		track.setPointerCapture(event.pointerId);
	}

	function pointerMove(event: PointerEvent) {
		if (!dragging || locked) return;
		const pixels = Math.max(0, Math.min(usableWidth(), startPixels + event.clientX - startX));
		progress = Math.round((pixels / usableWidth()) * 100);
	}

	async function commit() {
		if (!ready || locked) {
			reset();
			return;
		}
		confirming = true;
		try {
			await onconfirm();
		} finally {
			confirming = false;
			reset();
		}
	}

	function pointerUp(event: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
		void commit();
	}

	function pointerCancel(event: PointerEvent) {
		if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
		reset();
	}

	function keyDown(event: KeyboardEvent) {
		if (locked || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
		event.preventDefault();
		keyboardActive = true;
		progress = Math.max(0, Math.min(100, progress + (event.key === 'ArrowRight' ? 10 : -10)));
	}

	function keyUp(event: KeyboardEvent) {
		if (!keyboardActive || event.key !== 'ArrowRight') return;
		keyboardActive = false;
		if (ready) void commit();
	}
</script>

<div
	bind:this={track}
	class:ready
	class:dragging
	class:locked
	class="slide-confirm"
	style={`--slide-progress: ${progress / 100}`}
	role="slider"
	tabindex={locked ? -1 : 0}
	aria-label={label}
	aria-valuemin="0"
	aria-valuemax="100"
	aria-valuenow={progress}
	aria-valuetext={ready ? 'Bereit zum Bestätigen' : `${progress} Prozent`}
	aria-disabled={locked}
	onpointerdown={pointerDown}
	onpointermove={pointerMove}
	onpointerup={pointerUp}
	onpointercancel={pointerCancel}
	onkeydown={keyDown}
	onkeyup={keyUp}
>
	<div class="fill" aria-hidden="true"></div>
	<div class="copy" aria-hidden="true">
		<strong>{ready ? 'Loslassen zum Bestätigen' : label}</strong>
		<span>{ready ? 'Entscheidung wird lokal protokolliert' : hint}</span>
	</div>
	<div class="thumb" aria-hidden="true">
		{#if busy || confirming}
			<LoaderCircle size={21} class="spinner" />
		{:else if ready}
			<Check size={21} />
		{:else}
			<ChevronRight size={23} />
		{/if}
	</div>
</div>

<style>
	.slide-confirm {
		position: relative;
		display: grid;
		align-items: center;
		min-height: 56px;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--slide-accent, hsl(181 53% 34%)) 42%, var(--color-border));
		border-radius: 999px;
		outline: none;
		background: color-mix(in srgb, var(--slide-accent, hsl(181 53% 34%)) 7%, var(--color-card));
		box-shadow: inset 0 1px 1px rgb(0 0 0 / .035);
		cursor: default;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}
	.slide-confirm:focus-visible {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--slide-accent, hsl(181 53% 34%)) 22%, transparent);
	}
	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		width: calc(52px + (100% - 52px) * var(--slide-progress));
		background: color-mix(in srgb, var(--slide-accent, hsl(181 53% 34%)) 15%, transparent);
		transition: width 180ms ease;
	}
	.dragging .fill { transition: none; }
	.copy {
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		padding: 7px 58px;
		text-align: center;
		pointer-events: none;
	}
	.copy strong { font-size: 12px; font-weight: 650; line-height: 1.2; }
	.copy span { color: var(--color-muted-foreground); font-size: 9px; line-height: 1.3; }
	.thumb {
		position: absolute;
		left: calc((100% - 52px) * var(--slide-progress));
		z-index: 2;
		display: grid;
		place-items: center;
		width: 46px;
		height: 46px;
		margin-left: 4px;
		border-radius: 50%;
		color: white;
		background: var(--slide-accent, hsl(181 53% 34%));
		box-shadow: 0 2px 8px rgb(0 0 0 / .2);
		transition: left 180ms ease, transform 180ms ease;
		cursor: grab;
	}
	.dragging .thumb { transition: none; cursor: grabbing; transform: scale(1.04); }
	.ready .thumb { background: hsl(154 50% 38%); }
	.locked { opacity: .5; }
	.locked .thumb { cursor: not-allowed; }
	.thumb :global(.spinner) { animation: spin 1s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) {
		.fill, .thumb { transition: none; }
	}
</style>
