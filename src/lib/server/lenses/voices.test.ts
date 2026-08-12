import { describe, expect, it } from 'vitest';
import {
	buildVotesForFeedback,
	deterministicVoiceReason,
	toLensDomain
} from './voices.js';

describe('mail-queue voice presentation', () => {
	it('presents the job-lead provenance alias as the existing Job domain', () => {
		expect(toLensDomain('job-lead')).toBe('job');
	});

	it('explains non-Immo deterministic votes with the deciding signal', () => {
		const voices = buildVotesForFeedback(
			{
				domain: 'job-lead',
				heuristic_reason: 'keine Immo-Indikatoren',
				heuristic_markers: ['override:recipient_alias:job-lead']
			},
			[],
			[]
		);

		expect(voices[0]).toMatchObject({
			kind: 'present',
			domain: 'job',
			reasoning: 'Empfänger-Alias → Job'
		});
		expect(JSON.stringify(voices[0])).not.toContain('Immo-Indikatoren');
	});

	it('keeps the specific heuristic evidence for Immo votes', () => {
		expect(
			deterministicVoiceReason('immo', 'Portal und PLZ erkannt', ['tier1:portal_domain'])
		).toBe('Portal und PLZ erkannt');
	});
});
