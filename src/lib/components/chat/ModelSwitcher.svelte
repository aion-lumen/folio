<script lang="ts">
	import { onMount } from 'svelte';
	import type { ExecutionProfile } from '$lib/types/execution-profile.js';

	type Profile = { id: string; name: string; description: string };

	let profiles = $state<Profile[]>([]);
	let active = $state('unknown');
	let switching = $state(false);
	let lastError = $state('');
	let executionProfile = $state<ExecutionProfile | null>(null);

	function contextLabel(value: number | null): string {
		if (!value) return 'ctx unbekannt';
		return value >= 1024 && value % 1024 === 0 ? `${value / 1024}k ctx` : `${value} ctx`;
	}

	function artifactLabel(profile: ExecutionProfile): string {
		const parts = [profile.artifact?.source];
		if (profile.artifact?.engine && profile.artifact.engine !== 'unknown') {
			parts.push(profile.artifact.engine.toUpperCase());
		}
		parts.push(profile.artifact?.quantization, contextLabel(profile.contextLength));
		return parts.filter(Boolean).join(' · ');
	}

	function routingLabel(profile: ExecutionProfile): string {
		if (!profile.routing) return '';
		return `${profile.routing.deviceProfileId} · ${profile.routing.slot}`;
	}

	async function loadProfiles() {
		try {
			const r = await fetch('/api/hermes/model');
			const data = await r.json();
			profiles = data.profiles;
			active = data.active;
			executionProfile = data.executionProfile ?? null;
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

<div
	class="model-switcher"
	title={lastError || (executionProfile
		? `${executionProfile.artifact?.id ?? 'Artefakt nicht lokal verifiziert'} · Fingerprint ${executionProfile.fingerprint}`
		: 'Modell wechseln')}
>
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
	{#if executionProfile}
		<span class="execution-profile" data-verification={executionProfile.verification}>
			<span class="model-id">{executionProfile.modelId}</span>
			<span class="artifact-meta">{artifactLabel(executionProfile)}</span>
			{#if executionProfile.routing}
				<span class="artifact-meta">{routingLabel(executionProfile)}</span>
			{/if}
		</span>
	{/if}
</div>

<style>
	.model-switcher {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		font-size: 0.75rem;
	}

	.execution-profile {
		flex-basis: 100%;
		display: flex;
		flex-direction: column;
		gap: 1px;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.62rem;
		line-height: 1.25;
		color: var(--color-muted-foreground);
		overflow-wrap: anywhere;
		white-space: normal;
		max-width: 100%;
	}

	.model-id {
		color: var(--color-foreground);
	}

	.artifact-meta {
		opacity: 0.85;
	}

	.execution-profile[data-verification='config-only'],
	.execution-profile[data-verification='unavailable'] {
		color: var(--color-destructive, #dc2626);
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
