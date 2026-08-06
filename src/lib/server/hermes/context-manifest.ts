import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import YAML from 'yaml';
import { getHermesContextPath } from '$lib/server/env.js';

type UnknownRecord = Record<string, unknown>;

export interface HermesContextManifest {
	schemaVersion: 1;
	promptVersion: string;
	fingerprint: string;
	maxChars: number;
	identity: string;
	responseStyle: string[];
	prohibitions: string[];
	sources: {
		memory: boolean;
		campaign: boolean;
		leuchtfeuer: boolean;
		dashboard: boolean;
		selectedObjectives: boolean;
		vaultGuidance: boolean;
	};
	vaultGuidance: {
		chapterFiles: string[];
		objectiveModel: string;
		statusWorkflow: string;
	};
}

function asRecord(value: unknown): UnknownRecord {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as UnknownRecord)
		: {};
}

function requiredString(value: unknown, key: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} must be a non-empty string`);
	return value.trim();
}

function stringList(value: unknown, key: string): string[] {
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
		throw new Error(`${key} must be a list of non-empty strings`);
	}
	return value.map((entry) => (entry as string).trim());
}

function booleanValue(value: unknown, key: string): boolean {
	if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean`);
	return value;
}

function safeRelativePath(value: string): string {
	if (isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
		throw new Error(`chapter_files contains an unsafe path: ${value}`);
	}
	return value.replace(/^\.\//, '');
}

export function parseHermesContextManifest(source: string): HermesContextManifest {
	const root = asRecord(YAML.parse(source));
	if (root.schema_version !== 1) throw new Error('hermes-context.yaml schema_version must be 1');
	const maxChars = root.max_chars;
	if (typeof maxChars !== 'number' || !Number.isInteger(maxChars) || maxChars < 1000 || maxChars > 100000) {
		throw new Error('max_chars must be an integer between 1000 and 100000');
	}
	const sources = asRecord(root.sources);
	const guidance = asRecord(root.vault_guidance);
	const normalized = {
		schemaVersion: 1 as const,
		promptVersion: requiredString(root.prompt_version, 'prompt_version'),
		maxChars,
		identity: requiredString(root.identity, 'identity'),
		responseStyle: stringList(root.response_style, 'response_style'),
		prohibitions: stringList(root.prohibitions, 'prohibitions'),
		sources: {
			memory: booleanValue(sources.memory, 'sources.memory'),
			campaign: booleanValue(sources.campaign, 'sources.campaign'),
			leuchtfeuer: booleanValue(sources.leuchtfeuer, 'sources.leuchtfeuer'),
			dashboard: booleanValue(sources.dashboard, 'sources.dashboard'),
			selectedObjectives: booleanValue(
				sources.selected_objectives,
				'sources.selected_objectives'
			),
			vaultGuidance: booleanValue(sources.vault_guidance, 'sources.vault_guidance')
		},
		vaultGuidance: {
			chapterFiles: stringList(guidance.chapter_files, 'vault_guidance.chapter_files').map(
				safeRelativePath
			),
			objectiveModel: requiredString(guidance.objective_model, 'vault_guidance.objective_model'),
			statusWorkflow: requiredString(guidance.status_workflow, 'vault_guidance.status_workflow')
		}
	};
	const fingerprint = createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
	return { ...normalized, fingerprint };
}

export async function readHermesContextManifest(): Promise<HermesContextManifest> {
	const path = getHermesContextPath();
	try {
		return parseHermesContextManifest(await readFile(path, 'utf-8'));
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`Could not load Hermes context manifest at ${path}: ${detail}`);
	}
}

export function renderManifestText(value: string, vaultRoot: string): string {
	return value.replaceAll('{{vault_root}}', vaultRoot.replace(/\/$/, ''));
}
