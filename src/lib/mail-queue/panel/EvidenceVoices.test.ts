import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import EvidenceVoices from './EvidenceVoices.svelte';
import type { Voice } from '$lib/server/lenses/voices.js';

function markup(voices: Voice[]) {
	return render(EvidenceVoices, { props: { voices } }).body;
}

describe('assessment provenance in the mail detail panel', () => {
	it('shows the stored model beside its own reason and verdict, including the reviewer', () => {
		const html = markup([
			{ kind: 'present', label: 'L1', modelId: 'local-model-a', domain: 'finance', reasoning: 'Invoice recognised', confidence: 0.95 },
			{ kind: 'present', label: 'R', modelId: 'local-reviewer', domain: 'werbung', reasoning: 'Promotional offer', confidence: 0.8 }
		]);
		expect(html).toMatch(/Invoice recognised[\s\S]*local-model-a[\s\S]*finance · 95%/);
		expect(html).toMatch(/Promotional offer[\s\S]*local-reviewer[\s\S]*werbung · 80%/);
	});
	it('distinguishes fixed rules from a model and preserves unknown historical identities', () => {
		const html = markup([
			{ kind: 'present', label: 'H', domain: 'finance' },
			{ kind: 'present', label: 'L2', domain: 'finance', modelId: null }
		]);
		expect(html).toContain('Feste Regeln · kein Sprachmodell');
		expect(html).toContain('Modell nicht gespeichert');
	});
	it('keeps a missing assessment and its cause distinct from a completed vote', () => {
		const html = markup([{ kind: 'missing', label: 'L3', modelId: 'local-model-b', reason: 'timeout' }]);
		expect(html).toContain('[L3] · local-model-b · timeout');
		expect(html).not.toContain('Modell nicht gespeichert');
	});
	it('escapes model identifiers instead of interpreting them as markup', () => {
		const html = markup([{ kind: 'present', label: 'L1', domain: 'finance', modelId: '<img src=x onerror=alert(1)>' }]);
		expect(html).not.toContain('<img');
		expect(html).toContain('&lt;img');
	});
});
