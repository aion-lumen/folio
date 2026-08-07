import { describe, expect, it } from 'vitest';
import {
	modelIdFromArtifactPath,
	resolveExecutionProfileFromConfig,
	type InstalledModel
} from './execution-profile.js';
import { parseModelRoutingManifest } from './model-routing.js';

const installed: InstalledModel[] = [
	{
		id: 'unsloth/Qwen3.6-35B-A3B-UD-MLX-4bit',
		source: 'unsloth',
		engine: 'mlx',
		quantization: '4-bit',
		revision: null,
		modelKey: 'qwen3-6-35b-a3b-ud-mlx'
	}
];

describe('Hermes execution profile', () => {
	it('resolves the exact local artifact without exposing config secrets', () => {
		const routing = parseModelRoutingManifest(`
schema_version: 1
device_profile: test-device
default_slot: heavy
slots:
  small: { hermes_profiles: [ollama], model_ids: [small-model], purpose: [routine] }
  heavy: { hermes_profiles: [architect], model_ids: [qwen3.6-35b-a3b-ud-mlx], purpose: [reasoning] }
policy: { max_loaded_models: 1, auto_switch: false }
`);
		const profile = resolveExecutionProfileFromConfig(
			`model:
  default: qwen3.6-35b-a3b-ud-mlx
  provider: custom
  base_url: http://127.0.0.1:1234/v1
  api_key: top-secret
  context_length: 131072
agent:
  reasoning_effort: medium
profiles:
  architect:
    model: qwen3.6-35b-a3b-ud-mlx
`,
			installed,
			undefined,
			routing
		);

		expect(profile).toMatchObject({
			profileId: 'architect',
			modelId: 'qwen3.6-35b-a3b-ud-mlx',
			provider: 'custom',
			endpoint: 'local',
			contextLength: 131072,
			thinking: { enabled: null, preserve: null, reasoningEffort: 'medium' },
			artifact: {
				id: 'unsloth/Qwen3.6-35B-A3B-UD-MLX-4bit',
				engine: 'mlx',
				quantization: '4-bit'
			},
			verification: 'local-artifact',
			routing: { deviceProfileId: 'test-device', slot: 'heavy' }
		});
		expect(JSON.stringify(profile)).not.toContain('top-secret');
		expect(profile.fingerprint).toMatch(/^[a-f0-9]{16}$/);
	});

	it('distinguishes a configured model from a locally verified artifact', () => {
		const profile = resolveExecutionProfileFromConfig(`model:\n  default: remote-model\n  provider: custom\n  base_url: https://example.test/v1\n`);
		expect(profile.verification).toBe('config-only');
		expect(profile.endpoint).toBe('remote');
		expect(profile.artifact).toBeNull();
	});

	it('fails closed when the Hermes config is malformed', () => {
		const profile = resolveExecutionProfileFromConfig('model: [');
		expect(profile.verification).toBe('unavailable');
		expect(profile.modelId).toBe('unknown');
	});

	it('normalizes LM Studio quantization suffixes for matching', () => {
		expect(modelIdFromArtifactPath('/models/Qwen3.6-35B-A3B-UD-MLX-4bit')).toBe(
			'qwen3-6-35b-a3b-ud-mlx'
		);
	});
});
