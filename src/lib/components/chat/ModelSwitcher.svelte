<script lang="ts">
	import { onMount } from 'svelte';

	type Profile = { id: string; name: string; description: string };

	let profiles = $state<Profile[]>([]);
	let active = $state('unknown');
	let switching = $state(false);
	let lastError = $state('');

	async function loadProfiles() {
		try {
			const r = await fetch('/api/hermes/model');
			const data = await r.json();
			profiles = data.profiles;
			active = data.active;
		} catch (e) {
			lastError = String(e);
		}
	}

	async function switchProfile(profileId: string) {
		if (switching || profileId === active || profileId === 'unknown') return;
		switching = true;
		lastError = '';
		try {
			const r = await fetch('/api/hermes/model', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ profileId })
			});
			const data = await r.json();
			if (!r.ok) throw new Error(data.error || 'Switch failed');
			await new Promise((res) => setTimeout(res, 1500));
			await loadProfiles();
		} catch (e) {
			lastError = e instanceof Error ? e.message : String(e);
		} finally {
			switching = false;
		}
	}

	onMount(loadProfiles);
</script>

<div class="model-switcher" title={lastError || 'Modell wechseln'}>
	<select
		value={active}
		onchange={(e) => switchProfile(e.currentTarget.value)}
		disabled={switching}
		aria-label="Modell-Profil"
	>
		{#each profiles as profile (profile.id)}
			<option value={profile.id} title={profile.description}>
				{profile.name}
			</option>
		{/each}
		{#if active === 'unknown'}
			<option value="unknown" disabled>Unknown</option>
		{/if}
	</select>

	{#if switching}
		<span class="spinner" aria-hidden="true">↻</span>
	{:else if lastError}
		<span class="error" title={lastError}>!</span>
	{/if}
</div>

<style>
	.model-switcher {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
	}

	select {
		background: transparent;
		border: 1px solid var(--border, #d4d4d8);
		border-radius: 4px;
		padding: 2px 6px;
		color: inherit;
		cursor: pointer;
		max-width: 12rem;
	}

	select:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	.spinner {
		display: inline-block;
		animation: spin 1s linear infinite;
	}

	.error {
		color: var(--error, #dc2626);
		font-weight: bold;
		cursor: help;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
