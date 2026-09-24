import { describe, expect, it } from 'vitest';
import { parseCartaTrackerSource } from './carta-tracker.js';

const position = (url = 'https://jobs.example/roles/123456?utm_source=x') => `[{"title":"Role","company":"Acme","url":"${url}","status":"review","note":"https://safe.example/a//b"},]`;

describe('Carta tracker literal reader', () => {
	it('parses comments and trailing commas without corrupting comment-like strings', () => {
		const source = `<script>\nconst DATA = ${position()};\nconst REJECTED = [\n// history\n["Acme","Other role","01.09.26","No // concern"],\n];\n</script>`;
		const result = parseCartaTrackerSource(source, '/fixture');
		expect(result.positions[0].url).toBe('https://jobs.example/roles/123456');
		expect(result.positions[0].note).toContain('//');
		expect(result.rejected[0].reason).toContain('//');
		expect(result.positions[0].rawHash).toMatch(/^[a-f0-9]{64}$/);
	});

	it('rejects multiple sentinels, malformed rows and duplicate listing identities', () => {
		expect(() => parseCartaTrackerSource(`const DATA=[]; const DATA=[];\nconst REJECTED=[];`)).toThrow(/data_markers:2/);
		expect(() => parseCartaTrackerSource(`const DATA=[{"title":"x"}];\nconst REJECTED=[];`)).toThrow(/position_schema/);
		const row = '{"title":"Role","company":"Acme","url":"https://jobs.example/roles/123456","status":"review"}';
		const duplicate = `[${row},${row}]`;
		expect(() => parseCartaTrackerSource(`const DATA=${duplicate};\nconst REJECTED=[];`)).toThrow(/duplicate_identity/);
	});

	it('keeps different roles at the same employer distinct in rejection history', () => {
		const source = `const DATA=[];\nconst REJECTED=[["Acme","Role A","2026","No"],["Acme","Role B","2026","No"]];`;
		const result = parseCartaTrackerSource(source);
		expect(result.rejected[0].identity).not.toBe(result.rejected[1].identity);
	});
});
