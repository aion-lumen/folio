import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import YAML from 'yaml';
import type { ExecutionProfile, ModelArtifact } from '$lib/types/execution-profile.js';
import { getHermesHomePath } from '$lib/server/env.js';
import { readHermesContextManifest } from './context-manifest.js';
import {
	readModelRoutingManifest,
	resolveModelRoutingSlot,
	type ModelRoutingManifest
} from './model-routing.js';

export const HERMES_PROMPT_VERSION = 'inline-v1';
export const HERMES_PROMPT_FINGERPRINT = 'legacy-inline';
export const HERMES_POLICY_VERSION = 'folio-hermes-adapter-v1';

type UnknownRecord = Record<string, unknown>;

export interface InstalledModel extends ModelArtifact {
	modelKey: string;
}

export interface PromptIdentity {
	version: string;
	fingerprint: string;
}

function asRecord(value: unknown): UnknownRecord {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as UnknownRecord)
		: {};
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
	return typeof value === 'boolean' ? value : null;
}

function normalizeModelKey(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-(?:2|3|4|5|6|8)bit$/g, '')
		.replace(/-(?:q|iq)[0-9][a-z0-9_-]*$/g, '')
		.replace(/^-|-$/g, '');
}

function endpointKind(baseUrl: string | null): ExecutionProfile['endpoint'] {
	if (!baseUrl) return 'unknown';
	try {
		const host = new URL(baseUrl).hostname;
		return host === '127.0.0.1' || host === 'localhost' || host === '::1' ? 'local' : 'remote';
	} catch {
		return 'unknown';
	}
}

function fingerprint(profile: Omit<ExecutionProfile, 'fingerprint'>): string {
	return createHash('sha256').update(JSON.stringify(profile)).digest('hex').slice(0, 16);
}

function unavailableProfile(
	prompt: PromptIdentity = {
		version: HERMES_PROMPT_VERSION,
		fingerprint: HERMES_PROMPT_FINGERPRINT
	},
	routing?: ModelRoutingManifest
): ExecutionProfile {
	const base: Omit<ExecutionProfile, 'fingerprint'> = {
		schemaVersion: 1,
		runtime: 'hermes',
		profileId: 'default',
		modelId: 'unknown',
		provider: 'unknown',
		endpoint: 'unknown',
		contextLength: null,
		thinking: { enabled: null, preserve: null, reasoningEffort: null },
		promptVersion: prompt.version,
		promptFingerprint: prompt.fingerprint,
		policyVersion: HERMES_POLICY_VERSION,
		artifact: null,
		verification: 'unavailable',
		...(routing
			? {
				routing: {
					deviceProfileId: routing.deviceProfileId,
					slot: 'unassigned' as const,
					manifestFingerprint: routing.fingerprint
				}
			}
			: {})
	};
	return { ...base, fingerprint: fingerprint(base) };
}

export function resolveExecutionProfileFromConfig(
	configYaml: string,
	installedModels: InstalledModel[] = [],
	prompt: PromptIdentity = {
		version: HERMES_PROMPT_VERSION,
		fingerprint: HERMES_PROMPT_FINGERPRINT
	},
	routing?: ModelRoutingManifest
): ExecutionProfile {
	let root: UnknownRecord;
	try {
		root = asRecord(YAML.parse(configYaml));
	} catch {
		return unavailableProfile(prompt, routing);
	}

	const model = asRecord(root.model);
	const agent = asRecord(root.agent);
	const profiles = asRecord(root.profiles);
	const modelId = asString(model.default);
	if (!modelId) return unavailableProfile(prompt, routing);

	const matchingProfile = Object.entries(profiles).find(([, value]) => {
		return asString(asRecord(value).model) === modelId;
	});
	const installed = installedModels.find((candidate) => candidate.modelKey === normalizeModelKey(modelId));
	const artifact: ModelArtifact | null = installed
		? {
				id: installed.id,
				source: installed.source,
				engine: installed.engine,
				quantization: installed.quantization,
				revision: installed.revision
			}
		: null;

	const base: Omit<ExecutionProfile, 'fingerprint'> = {
		schemaVersion: 1,
		runtime: 'hermes',
		profileId: matchingProfile?.[0] ?? 'default',
		modelId,
		provider: asString(model.provider) ?? 'unknown',
		endpoint: endpointKind(asString(model.base_url)),
		contextLength: asNumber(model.context_length),
		thinking: {
			enabled: asBoolean(model.enable_thinking),
			preserve: asBoolean(model.preserve_thinking),
			reasoningEffort: asString(agent.reasoning_effort)
		},
		promptVersion: prompt.version,
		promptFingerprint: prompt.fingerprint,
		policyVersion: HERMES_POLICY_VERSION,
		artifact,
		verification: artifact ? 'local-artifact' : 'config-only',
		...(routing
			? {
				routing: {
					deviceProfileId: routing.deviceProfileId,
					slot: resolveModelRoutingSlot(routing, matchingProfile?.[0] ?? 'default', modelId),
					manifestFingerprint: routing.fingerprint
				}
			}
			: {})
	};
	return { ...base, fingerprint: fingerprint(base) };
}

async function readInstalledModel(owner: string, directory: string, modelsRoot: string): Promise<InstalledModel> {
	const modelRoot = join(modelsRoot, owner, directory);
	let config: UnknownRecord = {};
	try {
		config = asRecord(JSON.parse(await readFile(join(modelRoot, 'config.json'), 'utf-8')));
	} catch {
		// A model without readable metadata can still be matched by its directory name.
	}
	const quantization = asRecord(config.quantization_config ?? config.quantization);
	const bits = asNumber(quantization.bits);
	const lower = directory.toLowerCase();
	const engine = lower.includes('mlx')
		? 'mlx'
		: lower.includes('gguf')
			? 'gguf'
			: owner.toLowerCase() === 'ollama'
				? 'ollama'
				: 'unknown';
	return {
		id: `${owner}/${directory}`,
		source: owner || null,
		engine,
		quantization: bits ? `${bits}-bit` : null,
		revision: asString(config._commit_hash ?? config.commit_hash),
		modelKey: normalizeModelKey(directory)
	};
}

export async function scanInstalledModels(
	modelsRoot = join(homedir(), '.lmstudio', 'models')
): Promise<InstalledModel[]> {
	try {
		const owners = await readdir(modelsRoot, { withFileTypes: true });
		const models: InstalledModel[] = [];
		for (const owner of owners.filter((entry) => entry.isDirectory())) {
			const entries = await readdir(join(modelsRoot, owner.name), { withFileTypes: true });
			for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
				models.push(await readInstalledModel(owner.name, entry.name, modelsRoot));
			}
		}
		return models;
	} catch {
		return [];
	}
}

export async function readHermesExecutionProfile(prompt?: PromptIdentity): Promise<ExecutionProfile> {
	try {
		const [config, installed, manifest, routing] = await Promise.all([
			readFile(join(getHermesHomePath(), 'config.yaml'), 'utf-8'),
			scanInstalledModels(),
			prompt ? Promise.resolve(null) : readHermesContextManifest(),
			readModelRoutingManifest().catch((error) => {
				console.warn('[hermes] model routing disabled:', error);
				return null;
			})
		]);
		const promptIdentity =
			prompt ??
			(manifest
				? { version: manifest.promptVersion, fingerprint: manifest.fingerprint }
				: { version: HERMES_PROMPT_VERSION, fingerprint: HERMES_PROMPT_FINGERPRINT });
		return resolveExecutionProfileFromConfig(config, installed, promptIdentity, routing ?? undefined);
	} catch {
		return unavailableProfile(prompt);
	}
}

export function modelIdFromArtifactPath(path: string): string {
	return normalizeModelKey(basename(path));
}
