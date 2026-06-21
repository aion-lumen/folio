<!--
  F.9 Block-1/B7 — Ambient Worker-Pille im Activity-Bar Bottom.
  Architekt-Spec: ambient by default, Position direkt unter Pipeline-Glyph.
  States:
    - idle (kein activeRun): grauer Dot, Tooltip mit Last-Run-Info
    - active (workerRunStore.pipelineBusy): lumen-warm Pulse-Animation
    - initial-highlight (5s beim ersten Worker-Run pro Session): extra-prominent
  Klick → goto('/pipeline'). Tooltip via title-Attribute (HTML-native, ambient).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { workerRunStore } from '$lib/stores/workerRun.svelte.js';

	const SESSION_FLAG = 'folio.workerPill.firstRunSeen';
	const HIGHLIGHT_DURATION_MS = 5000;

	let initialHighlight = $state(false);
	let highlightTimer: ReturnType<typeof setTimeout> | null = null;

	const isActive = $derived(workerRunStore.pipelineBusy);
	const activeRun = $derived(workerRunStore.activeRun);
	const lastEnded = $derived(workerRunStore.lastEndedRun);

	const tooltipLabel = $derived.by(() => {
		if (activeRun) {
			const mode = activeRun.mode === 'validator' ? 'validator (auto)' : activeRun.mode;
			return `${activeRun.account} · ${mode} · läuft`;
		}
		if (workerRunStore.pipelineInTransition) {
			return 'Pipeline-Transition (Worker→Auto-Validator)';
		}
		if (lastEnded) {
			const ts = new Date(lastEnded.endedAt);
			const ago = formatAgo(Date.now() - ts.getTime());
			return `Letzter Run: ${lastEnded.account} · ${lastEnded.mailsProcessed} Mails · ${ago}`;
		}
		return 'Pipeline idle · noch kein Worker gelaufen';
	});

	function formatAgo(ms: number): string {
		const sec = Math.floor(ms / 1000);
		if (sec < 60) return `vor ${sec}s`;
		const min = Math.floor(sec / 60);
		if (min < 60) return `vor ${min}min`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `vor ${hr}h`;
		const day = Math.floor(hr / 24);
		return `vor ${day}d`;
	}

	// F.9 Initial-Highlight: erstes Mal pro Session beim ersten Worker-Run-Start
	// pulst die Pille 5s extra-prominent für Erstuser-Discoverability.
	$effect(() => {
		if (!isActive) return;
		if (typeof sessionStorage === 'undefined') return;
		if (sessionStorage.getItem(SESSION_FLAG) === '1') return;
		// erste Aktivierung in dieser Session — Highlight
		sessionStorage.setItem(SESSION_FLAG, '1');
		initialHighlight = true;
		if (highlightTimer) clearTimeout(highlightTimer);
		highlightTimer = setTimeout(() => {
			initialHighlight = false;
			highlightTimer = null;
		}, HIGHLIGHT_DURATION_MS);
	});

	onMount(() => {
		// Fetch initial status so idle-state shows last-ended correctly
		workerRunStore.fetchStatus();
	});

	function handleClick() {
		goto('/pipeline');
	}
</script>

<button
	type="button"
	class="worker-pill"
	class:active={isActive}
	class:highlight={initialHighlight}
	onclick={handleClick}
	title={tooltipLabel}
	aria-label={tooltipLabel}
>
	<span class="dot" class:dot-active={isActive}></span>
</button>

<style>
	.worker-pill {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 36px;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0;
		border-radius: 6px;
		transition: background 150ms;
	}
	.worker-pill:hover {
		background: var(--color-muted);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-muted-foreground);
		opacity: 0.5;
		transition: background 200ms, opacity 200ms;
	}
	.dot-active {
		background: var(--color-lumen-warm, hsl(28 92% 58%));
		opacity: 1;
		animation: worker-pulse 1.6s ease-in-out infinite;
	}

	/* Initial-Highlight: extra-prominent für 5s beim ersten Run der Session */
	.worker-pill.highlight .dot {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-lumen-warm, hsl(28 92% 58%)) 30%, transparent);
		animation: worker-pulse-strong 1s ease-in-out infinite;
	}

	@keyframes worker-pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.55; transform: scale(0.9); }
	}
	@keyframes worker-pulse-strong {
		0%, 100% {
			opacity: 1;
			transform: scale(1);
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-lumen-warm, hsl(28 92% 58%)) 35%, transparent);
		}
		50% {
			opacity: 0.7;
			transform: scale(1.15);
			box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-lumen-warm, hsl(28 92% 58%)) 15%, transparent);
		}
	}
</style>
