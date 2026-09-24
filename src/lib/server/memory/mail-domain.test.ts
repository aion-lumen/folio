import { describe, expect, it } from 'vitest';
import { decideMailDomain } from './mail-domain.js';
import type { ValidatorOpinionRow } from '../folio-db/types.js';
const row = { id: 7, account_id: 'test', imap_uid: 42 };
const models = ['a', 'b', 'c'];
const votes = (domains: string[]) => domains.map((domain, i) => ({ feedback_id: 7, account_id: 'test', imap_uid: 42, validator_model: models[i], validator_domain: domain }) as ValidatorOpinionRow);
describe('mail to memory domain boundary', () => {
	it('uses complete agreement even when a heuristic used another domain', () => {
		expect(decideMailDomain(row, null, votes(['finance','finance','finance']), models)).toMatchObject({ domain: 'finance', source: 'model_consensus' });
	});
	it('keeps human corrections ahead of all model votes, including explicit unsorted', () => {
		expect(decideMailDomain(row, 'unsorted', votes(['finance','finance','finance']), models)).toMatchObject({ domain: 'unsorted', source: 'human' });
	});
	it('does not silently fall back on heuristics for incomplete or conflicting opinions', () => {
		expect(decideMailDomain(row, null, votes(['finance','finance']), models).source).toBe('incomplete');
		expect(decideMailDomain(row, null, votes(['finance','job','finance']), models)).toMatchObject({ domain: null, source: 'conflict' });
	});
	it('rejects identity-mismatched opinions and an underspecified roster', () => {
		const opinions = votes(['finance','finance','finance']); opinions[1].account_id = 'other';
		expect(decideMailDomain(row, null, opinions, models).source).toBe('incomplete');
		expect(decideMailDomain(row, null, votes(['finance']), ['a']).source).toBe('incomplete');
	});
	it('normalizes job-lead and ignores a conditional review as an extra base vote', () => {
		const opinions = votes(['job','job-lead','job']);
		opinions.push({ ...opinions[0], validator_model: 'conditional', validator_domain: 'finance' });
		expect(decideMailDomain(row, null, opinions, models).domain).toBe('job');
	});
});
