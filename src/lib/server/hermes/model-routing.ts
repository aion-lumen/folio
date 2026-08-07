import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { getModelRoutingPath } from '$lib/server/env.js';

type UnknownRecord = Record<string, unknown>;
export type ModelRoutingSlot = 'small' | 'heavy';

export interface ModelRoutingManifest {
	schemaVersion: 1;
	deviceProfileId: string;
	defaultSlot: ModelRoutingSlot;
	slots: Record<
		ModelRoutingSlot,
		{ hermesProfiles: string[]; modelIds: string[]; purpose: string[] }
	>;
	policy: { maxLoadedModels: number; autoSwitch: boolean };
	fingerprint: string;
	sourcePath: string;
}

function asRecord(value: unknown): UnknownRecord {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as UnknownRecord)
		: {};
}

function requiredString(value: unknown, key: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} must be a string`);
	return value.trim();
}

function stringList(value: unknown, key: string): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
		throw new Error(`${key} must be a list of strings`);
	}
	return value.map((item) => (item as string).trim());
}

export function parseModelRoutingManifest(
	source: string,
	sourcePath = '<memory>'
): ModelRoutingManifest {
	const root = asRecord(YAML.parse(source));
	if (root.schema_version !== 1) throw new Error('model routing schema_version must be 1');
	const defaultSlotValue = requiredString(root.default_slot, 'default_slot');
	if (defaultSlotValue !== 'small' && defaultSlotValue !== 'heavy') {
		throw new Error('default_slot must be small or heavy');
	}
	const defaultSlot: ModelRoutingSlot = defaultSlotValue;
	const slots = asRecord(root.slots);
	const readSlot = (name: ModelRoutingSlot) => {
		const slot = asRecord(slots[name]);
		return {
			hermesProfiles: stringList(slot.hermes_profiles, `slots.${name}.hermes_profiles`),
			modelIds: stringList(slot.model_ids, `slots.${name}.model_ids`),
			purpose: stringList(slot.purpose, `slots.${name}.purpose`)
		};
	};
	const policy = asRecord(root.policy);
	const maxLoadedModels = policy.max_loaded_models;
	if (!Number.isInteger(maxLoadedModels) || (maxLoadedModels as number) < 1) {
		throw new Error('policy.max_loaded_models must be a positive integer');
	}
	if (typeof policy.auto_switch !== 'boolean') {
		throw new Error('policy.auto_switch must be a boolean');
	}
	const normalized = {
		schemaVersion: 1 as const,
		deviceProfileId: requiredString(root.device_profile, 'device_profile'),
		defaultSlot,
		slots: { small: readSlot('small'), heavy: readSlot('heavy') },
		policy: { maxLoadedModels: maxLoadedModels as number, autoSwitch: policy.auto_switch }
	};
	const fingerprint = createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
	return { ...normalized, fingerprint, sourcePath };
}

export async function readModelRoutingManifest(): Promise<ModelRoutingManifest | null> {
	const path = getModelRoutingPath();
	try {
		return parseModelRoutingManifest(await readFile(path, 'utf-8'), path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`Could not load model routing manifest at ${path}: ${detail}`);
	}
}

export function resolveModelRoutingSlot(
	manifest: ModelRoutingManifest,
	profileId: string,
	modelId: string
): ModelRoutingSlot | 'unassigned' {
	for (const name of ['small', 'heavy'] as const) {
		const slot = manifest.slots[name];
		if (slot.hermesProfiles.includes(profileId) || slot.modelIds.includes(modelId)) return name;
	}
	return 'unassigned';
}
