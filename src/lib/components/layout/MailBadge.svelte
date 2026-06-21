<script lang="ts">
	import MailDetailModal from '$lib/components/mail/MailDetailModal.svelte';

	type Badge = 'green' | 'amber' | 'red' | null;

	let badge = $state<Badge | undefined>(undefined); // undefined = loading
	let modalOpen = $state(false);

	$effect(() => {
		fetch('/api/vault/mail/status')
			.then((r) => r.json())
			.then((d: { badge: Badge }) => { badge = d.badge; })
			.catch(() => { badge = null; });
	});
</script>

{#if badge !== null && badge !== undefined}
	<button
		class="mail-badge"
		onclick={() => (modalOpen = true)}
		title="Mail-Pipeline · Status"
		aria-label="Mail-Integration öffnen"
	>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
			<rect x="3" y="5" width="18" height="14" rx="2" />
			<path d="M3 7l9 6 9-6" />
		</svg>
		<span class="mdot {badge}"></span>
	</button>
{/if}

{#if modalOpen}
	<MailDetailModal onClose={() => (modalOpen = false)} />
{/if}

<style>
	.mail-badge {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 6px;
		background: none;
		border: none;
		color: var(--color-muted-foreground);
		border-radius: 6px;
		cursor: pointer;
		transition: background 150ms ease, color 150ms ease;
		flex-shrink: 0;
	}
	.mail-badge:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.mail-badge svg { flex-shrink: 0; }

	.mdot {
		position: absolute;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		border: 1.5px solid var(--color-card);
		top: 3px;
		right: 3px;
	}
	.mdot.green { background: hsl(142 71% 45%); box-shadow: 0 0 4px hsl(142 71% 45% / 0.4); }
	.mdot.amber { background: hsl(32 100% 55%);  box-shadow: 0 0 4px hsl(32 100% 55% / 0.5); }
	.mdot.red   {
		background: hsl(0 74% 55%);
		box-shadow: 0 0 4px hsl(0 74% 55% / 0.55);
		animation: mdot-pulse 1.6s ease-in-out infinite;
	}
	@keyframes mdot-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
</style>
