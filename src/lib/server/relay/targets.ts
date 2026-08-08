import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';
import { isDemoVaultActive } from '../env.js';
import type { RelayAdapter, RelayCapability, RelayLocality, SessionTarget } from './types.js';

const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const CAPABILITIES = new Set<RelayCapability>(['analyze', 'reply_draft', 'objective_proposal', 'needs_context']);
const ADAPTERS = new Set<RelayAdapter>(['cowork-filesystem', 'hermes-local']);
const LOCALITIES = new Set<RelayLocality>(['local', 'cloud']);

export const DEMO_CAREER_TARGET: SessionTarget = {
	id: 'career-cowork',
	label: 'Karriere-Session',
	domain: 'career',
	adapter: 'cowork-filesystem',
	locality: 'cloud',
	capabilities: ['analyze', 'reply_draft', 'objective_proposal', 'needs_context'],
	allowed_data_classes: ['mail_body', 'mail_metadata', 'memory_context'],
	retention_days: 14
};

function ids(value: unknown, label: string): string[] {
	if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== 'string' || !ID.test(item))) {
		throw new Error(`invalid ${label}`);
	}
	return [...new Set(value as string[])];
}

export function loadSessionTargets(path = join(homedir(), '.folio', 'session-targets.yaml')): SessionTarget[] {
	if (!existsSync(path)) return isDemoVaultActive() ? [DEMO_CAREER_TARGET] : [];
	const parsed = YAML.parse(readFileSync(path, 'utf8')) as { schema?: unknown; targets?: unknown };
	if (parsed?.schema !== 'folio/session-targets/v1' || !Array.isArray(parsed.targets)) {
		throw new Error('invalid session-targets schema');
	}
	const seen = new Set<string>();
	return parsed.targets.map((raw, index) => {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`invalid target ${index}`);
		const value = raw as Record<string, unknown>;
		if (typeof value.id !== 'string' || !ID.test(value.id) || seen.has(value.id)) throw new Error(`invalid target id ${index}`);
		seen.add(value.id);
		if (typeof value.label !== 'string' || !value.label.trim()) throw new Error(`invalid target label ${value.id}`);
		if (typeof value.domain !== 'string' || !ID.test(value.domain)) throw new Error(`invalid target domain ${value.id}`);
		if (!ADAPTERS.has(value.adapter as RelayAdapter)) throw new Error(`invalid target adapter ${value.id}`);
		if (!LOCALITIES.has(value.locality as RelayLocality)) throw new Error(`invalid target locality ${value.id}`);
		const capabilities = ids(value.capabilities, `target capabilities ${value.id}`) as RelayCapability[];
		if (capabilities.some((item) => !CAPABILITIES.has(item))) throw new Error(`unknown target capability ${value.id}`);
		const retention = Number(value.retention_days);
		if (!Number.isInteger(retention) || retention < 1 || retention > 365) throw new Error(`invalid target retention ${value.id}`);
		return {
			id: value.id,
			label: value.label.trim(),
			domain: value.domain,
			adapter: value.adapter as RelayAdapter,
			locality: value.locality as RelayLocality,
			capabilities,
			allowed_data_classes: ids(value.allowed_data_classes, `target data classes ${value.id}`),
			retention_days: retention
		};
	});
}
