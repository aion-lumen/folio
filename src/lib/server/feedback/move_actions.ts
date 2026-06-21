// F.3 — Reader for config/move_actions.yaml (Folio-File-First, kein DB).
// Cached per process; YAML-Edit triggert keinen Auto-Reload (dev-server-restart nötig).

import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { getMoveActionsPath } from '../env.js';
import type { MoveAction } from './types.js';

let _cache: MoveAction[] | null = null;

export function loadMoveActions(): MoveAction[] {
	if (_cache) return _cache;
	const raw = readFileSync(getMoveActionsPath(), 'utf-8');
	const parsed = parseYaml(raw) as { move_actions?: MoveAction[] };
	const list = parsed.move_actions ?? [];
	_cache = list
		.filter((a) => a.active)
		.sort((a, b) => a.sort_order - b.sort_order);
	return _cache;
}

export function getMoveActionByKey(key: string): MoveAction | undefined {
	return loadMoveActions().find((a) => a.action_key === key);
}

export function listActionKeys(): string[] {
	return loadMoveActions().map((a) => a.action_key);
}
