import { json } from '@sveltejs/kit';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getHermesHomePath } from '$lib/server/env.js';
import { readHermesExecutionProfile } from '$lib/server/hermes/execution-profile.js';
import type { ExecutionProfile } from '$lib/types/execution-profile.js';
import type { RequestHandler } from './$types.js';

const execAsync = promisify(exec);

const PROFILES = [
	{
		id: 'ollama',
		name: 'Ollama (qwen3:30b-a3b)',
		description: 'Default — fast chat with tool-calling',
		helper: 'hermes-use-ollama'
	},
	{
		id: 'mlx',
		name: 'MLX Coder (Qwen3-Coder-30B)',
		description: 'For coding tasks — Apple Silicon native',
		helper: 'hermes-use-mlx'
	},
	{
		id: 'thinking',
		name: 'MLX Thinking (Qwen3.6-35B-A3B)',
		description: 'Hybrid thinking + agentic coding — slower (5-30s), strongest reasoning',
		helper: 'hermes-use-thinking'
	}
] as const;

function detectSwitchProfile(profile: ExecutionProfile): string {
	const modelId = profile.modelId.toLowerCase();
	if (profile.provider === 'ollama') return 'ollama';
	if (modelId.includes('coder')) return 'mlx';
	if (modelId.includes('qwen3.6') || modelId.includes('qwen-3.6') || modelId.includes('thinking')) {
		return 'thinking';
	}
	return 'unknown';
}

export const GET: RequestHandler = async () => {
	try {
		const executionProfile = await readHermesExecutionProfile();
		return json({
			profiles: PROFILES,
			active: detectSwitchProfile(executionProfile),
			executionProfile
		});
	} catch (e) {
		return json({ profiles: PROFILES, active: 'unknown', executionProfile: null, error: String(e) });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const { profileId } = (await request.json()) as { profileId?: string };

	const profile = PROFILES.find((p) => p.id === profileId);
	if (!profile) return json({ error: 'Unknown profile' }, { status: 400 });

	const helperPath = join(homedir(), '.local', 'bin', profile.helper);

	try {
		const { stdout, stderr } = await execAsync(helperPath, { timeout: 30_000 });
		return json({ success: true, profile: profileId, output: (stdout + stderr).trim() });
	} catch (e: unknown) {
		const err = e as { message?: string; stdout?: string; stderr?: string };
		return json(
			{
				error: err.message ?? String(e),
				stdout: err.stdout ?? '',
				stderr: err.stderr ?? ''
			},
			{ status: 500 }
		);
	}
};
