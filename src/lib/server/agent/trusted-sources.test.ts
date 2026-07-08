import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	_resetTrustedSourcesCache,
	isSourceAutoTrusted,
	isTrustedSource,
	loadTrustedSources
} from './trusted-sources.js';

describe('trusted-sources', () => {
	let dir: string;
	let cfgPath: string;

	beforeEach(async () => {
		dir = join(tmpdir(), `trusted-src-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(dir, { recursive: true });
		cfgPath = join(dir, 'trusted_sources.yaml');
		await writeFile(cfgPath, 'trusted_sources:\n  - fable-session-claude-ai\n  - cowork-release-pilot\n');
		process.env.FOLIO_TRUSTED_SOURCES_PATH = cfgPath;
		_resetTrustedSourcesCache();
	});

	afterEach(() => {
		delete process.env.FOLIO_TRUSTED_SOURCES_PATH;
		_resetTrustedSourcesCache();
	});

	it('loads the configured sources', () => {
		expect(loadTrustedSources()).toEqual(['fable-session-claude-ai', 'cowork-release-pilot']);
	});

	it('isTrustedSource matches only listed sources', () => {
		expect(isTrustedSource('fable-session-claude-ai')).toBe(true);
		expect(isTrustedSource('mail-pipeline')).toBe(false);
		expect(isTrustedSource(undefined)).toBe(false);
		expect(isTrustedSource(null)).toBe(false);
	});

	it('isSourceAutoTrusted: trusted + not derived → true', () => {
		expect(isSourceAutoTrusted('fable-session-claude-ai', false)).toBe(true);
		expect(isSourceAutoTrusted('fable-session-claude-ai', undefined)).toBe(true);
	});

	it('isSourceAutoTrusted: untrusted source → false', () => {
		expect(isSourceAutoTrusted('mail-pipeline', false)).toBe(false);
	});

	it('isSourceAutoTrusted: derived_from_external revokes trust', () => {
		expect(isSourceAutoTrusted('fable-session-claude-ai', true)).toBe(false);
	});

	it('fail-closed: missing config → nothing trusted', () => {
		process.env.FOLIO_TRUSTED_SOURCES_PATH = join(dir, 'does-not-exist.yaml');
		_resetTrustedSourcesCache();
		expect(loadTrustedSources()).toEqual([]);
		expect(isSourceAutoTrusted('fable-session-claude-ai', false)).toBe(false);
	});
});
