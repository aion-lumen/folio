import { describe, expect, it } from 'vitest';
import {
	buildTriagePrompt,
	DEFAULT_PROMPT_VARIANT,
	type PromptVariant
} from './prompt.js';
import type { ParsedInboxDocument } from '../inbox/types.js';
import type { CampaignContext } from './context.js';

// STRICT_EXTRA is only appended for 'v1-strict'. This stable substring proves whether the
// strict rules leaked into a prompt.
const STRICT_MARKER = 'chapter fit is weak';

const doc: ParsedInboxDocument = {
	filename: 'sample.md',
	frontmatter: {
		folio_import: 'v1',
		type: 'note',
		target: 'current',
		id: 'test-doc',
		source: 'eval-fixture',
		created: '2026-07-10'
	},
	body: 'Ein kurzer Testinhalt ohne klares Ziel.'
};

const ctx: CampaignContext = {
	chapters: [
		{ slug: '01-neustart', title: 'Neustart', chapter_number: 1, status: 'active', objective_ids: [] }
	],
	objective_ids: []
};

describe('operational prompt-variant default (locked against drift)', () => {
	it('DEFAULT_PROMPT_VARIANT is v1', () => {
		// Locking assertion: v1 is the explicit operational default. v1-strict stays opt-in.
		expect(DEFAULT_PROMPT_VARIANT).toBe<PromptVariant>('v1');
	});

	it('no variant → resolves to v1 (identical prompt, no STRICT_EXTRA)', () => {
		const dflt = buildTriagePrompt(doc, ctx);
		const explicitV1 = buildTriagePrompt(doc, ctx, 'v1');
		expect(dflt).toBe(explicitV1);
		expect(dflt).not.toContain(STRICT_MARKER);
	});

	it('v1-strict remains available as an opt-in (STRICT_EXTRA present)', () => {
		const strict = buildTriagePrompt(doc, ctx, 'v1-strict');
		expect(strict).toContain(STRICT_MARKER);
	});
});
