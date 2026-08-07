import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	parseModelRoutingManifest,
	readModelRoutingManifest,
	resolveModelRoutingSlot
} from './model-routing.js';

const source = readFileSync(join(process.cwd(), 'config/model-routing.example.yaml'), 'utf-8');

describe('per-device model routing', () => {
	it('parses the checked-in example and resolves registered slots', () => {
		const manifest = parseModelRoutingManifest(source);
		expect(manifest.deviceProfileId).toBe('generic-apple-silicon');
		expect(manifest.policy).toEqual({ maxLoadedModels: 1, autoSwitch: false });
		expect(resolveModelRoutingSlot(manifest, 'ollama', 'other')).toBe('small');
		expect(resolveModelRoutingSlot(manifest, 'architect', 'qwen3.6-35b-a3b-ud-mlx')).toBe(
			'heavy'
		);
		expect(resolveModelRoutingSlot(manifest, 'unknown', 'unknown')).toBe('unassigned');
	});

	it('does not expose an executable-command field outside the closed schema', () => {
		const manifest = parseModelRoutingManifest(`${source}\ncommand: rm -rf /\n`);
		expect(manifest).not.toHaveProperty('command');
	});

	it('fails closed when a required slot is missing', () => {
		expect(() =>
			parseModelRoutingManifest(source.replace(/  heavy:\n[\s\S]*?\npolicy:/, 'policy:'))
		).toThrow('slots.heavy.hermes_profiles');
	});

	it('stays disabled when no per-device manifest exists', async () => {
		const previous = process.env.FOLIO_MODEL_ROUTING_PATH;
		process.env.FOLIO_MODEL_ROUTING_PATH = join(
			process.cwd(),
			'.missing-model-routing-for-test.yaml'
		);
		try {
			await expect(readModelRoutingManifest()).resolves.toBeNull();
		} finally {
			if (previous === undefined) delete process.env.FOLIO_MODEL_ROUTING_PATH;
			else process.env.FOLIO_MODEL_ROUTING_PATH = previous;
		}
	});
});
