import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSonarArchiveState } from './archive.js';

function manifest(overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		schema: 'aion-lumen/x-archive-import-manifest/v1',
		counts: { bookmarks: 4, following: 18, likes: 320 },
		privacy: { network_access: false, review_contains_post_text: false },
		warnings: [],
		...overrides
	});
}

describe('Sonar archive summary', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'folio-sonar-archive-'));
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('reads only aggregate counts from the newest normalized archive', () => {
		for (const date of ['2026-08-01', '2026-08-08']) {
			const directory = join(root, `x-archive-${date}`);
			mkdirSync(directory);
			writeFileSync(
				join(directory, 'manifest.json'),
				manifest({ counts: { bookmarks: 0, following: 279, likes: date === '2026-08-08' ? 69624 : 10 } })
			);
		}

		expect(readSonarArchiveState(root)).toEqual({
			healthy: true,
			summary: { importedOn: '2026-08-08', likes: 69624, following: 279, bookmarks: 0, warnings: 0 }
		});
	});

	it('reports a missing archive as an honest empty state', () => {
		expect(readSonarArchiveState(root)).toEqual({ healthy: true, summary: null });
	});

	it('rejects manifests that allow network access or contain invalid counts', () => {
		const directory = join(root, 'x-archive-2026-08-08');
		mkdirSync(directory);
		writeFileSync(
			join(directory, 'manifest.json'),
			manifest({
				counts: { bookmarks: 0, following: 1, likes: -1 },
				privacy: { network_access: true, review_contains_post_text: false }
			})
		);
		expect(readSonarArchiveState(root)).toEqual({ healthy: false, summary: null });
	});

	it('does not follow a manifest symlink', () => {
		const directory = join(root, 'x-archive-2026-08-08');
		mkdirSync(directory);
		writeFileSync(join(root, 'outside.json'), manifest());
		symlinkSync(join(root, 'outside.json'), join(directory, 'manifest.json'));
		expect(readSonarArchiveState(root)).toEqual({ healthy: false, summary: null });
	});
});
