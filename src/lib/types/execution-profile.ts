export interface ModelArtifact {
	/** Stable, non-secret identifier relative to LM Studio's model directory. */
	id: string;
	source: string | null;
	engine: 'mlx' | 'gguf' | 'ollama' | 'unknown';
	quantization: string | null;
	revision: string | null;
}

export interface ExecutionProfile {
	schemaVersion: 1;
	runtime: 'hermes';
	profileId: string;
	modelId: string;
	provider: string;
	endpoint: 'local' | 'remote' | 'unknown';
	contextLength: number | null;
	thinking: {
		enabled: boolean | null;
		preserve: boolean | null;
		reasoningEffort: string | null;
	};
	promptVersion: string;
	promptFingerprint: string;
	policyVersion: string;
	artifact: ModelArtifact | null;
	verification: 'local-artifact' | 'config-only' | 'unavailable';
	fingerprint: string;
}

export function executionProfileLabel(profile: ExecutionProfile): string {
	if (profile.verification === 'unavailable') return 'Modell nicht aufgelöst';
	const parts = [profile.modelId];
	if (profile.artifact?.engine && profile.artifact.engine !== 'unknown') {
		parts.push(profile.artifact.engine.toUpperCase());
	}
	if (profile.artifact?.quantization) parts.push(profile.artifact.quantization);
	if (profile.contextLength) {
		const context =
			profile.contextLength >= 1024 && profile.contextLength % 1024 === 0
				? `${profile.contextLength / 1024}k ctx`
				: `${profile.contextLength} ctx`;
		parts.push(context);
	}
	return parts.join(' · ');
}
