import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHermesContextManifest, renderManifestText } from './context-manifest.js';

function manifest(chapter = '_campaign/chapters/01-test.md'): string {
	return `schema_version: 1
prompt_version: test-v1
max_chars: 30000
identity: Local agent
response_style: [Short]
prohibitions: [No network]
sources:
  memory: false
  campaign: true
  leuchtfeuer: false
  dashboard: true
  selected_objectives: true
  vault_guidance: true
vault_guidance:
  chapter_files: [${chapter}]
  objective_model: "Read {{vault_root}}/objectives"
  status_workflow: Verify after writes
`;
}

describe('hermes-context.yaml', () => {
	it('parses a closed source manifest and fingerprints its effective content', () => {
		const parsed = parseHermesContextManifest(manifest());
		expect(parsed).toMatchObject({
			schemaVersion: 1,
			promptVersion: 'test-v1',
			sources: { memory: false, campaign: true },
			vaultGuidance: { chapterFiles: ['_campaign/chapters/01-test.md'] }
		});
		expect(parsed.fingerprint).toMatch(/^[a-f0-9]{16}$/);
		expect(parseHermesContextManifest(manifest()).fingerprint).toBe(parsed.fingerprint);
	});

	it('rejects paths which could expand the Hermes read surface', () => {
		expect(() => parseHermesContextManifest(manifest('../private.md'))).toThrow('unsafe path');
		expect(() => parseHermesContextManifest(manifest('/etc/passwd'))).toThrow('unsafe path');
	});

	it('rejects missing capability declarations instead of assuming access', () => {
		expect(() =>
			parseHermesContextManifest(manifest().replace('  memory: false\n', ''))
		).toThrow('sources.memory must be a boolean');
	});

	it('renders only the active vault placeholder', () => {
		expect(renderManifestText('Read {{vault_root}}/objectives', '/vault/')).toBe(
			'Read /vault/objectives'
		);
	});

	it('keeps the bundled demo manifest separate from private Hermes memory', () => {
		const parsed = parseHermesContextManifest(
			readFileSync(join(process.cwd(), 'templates/demo-vault/hermes-context.yaml'), 'utf-8')
		);
		expect(parsed.promptVersion).toBe('folio-hermes-demo-context-v1');
		expect(parsed.sources.memory).toBe(false);
		expect(parsed.vaultGuidance.chapterFiles).toEqual([
			'_campaign/chapters/01-neustart.md',
			'_campaign/chapters/02-integration.md',
			'_campaign/chapters/03-etablierung.md'
		]);
	});
});
