import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';

describe('candidate correction transport', () => {
	it('keeps the correction a native POST without a fetch submit handler', () => {
		const source = readFileSync(new URL('./CandidateCorrection.svelte', import.meta.url), 'utf8');
		const compiled = compile(source, { generate: 'client', filename: 'CandidateCorrection.svelte' }).js.code;
		expect(source).toContain('<form method="POST" action="?/correct">');
		expect(compiled).not.toContain('$app/forms');
		expect(compiled).not.toMatch(/\bfetch\s*\(/);
		expect(source).toContain('name="expected_version"');
		expect(source).toContain('name="fact_id"');
	});
});
