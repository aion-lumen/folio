import { describe, expect, it } from 'vitest';
import type { UserContext } from '$lib/server/feedback/time-decay.js';
import type { Regelwerk } from './loader.js';
import { computeActiveRules } from './active-rules.js';

const userContext: UserContext = {
	active_priorities: ['jobsuche'],
	time_decay: {
		immo: { actionable_within_days: 90, archive_within_days: 180 },
		job: { actionable_within_days: 90, archive_within_days: 180 },
		shopping: { actionable_within_days: 14, archive_within_days: 60 },
		finance: { actionable_within_days: 60, archive_within_days: 2555 },
		kontakt: { actionable_within_days: 30, archive_within_days: 365 },
		werbung: { actionable_within_days: 3, archive_within_days: 7 },
		system: { actionable_within_days: 7, archive_within_days: 30 },
		unsorted: { actionable_within_days: 30, archive_within_days: 180 }
	}
};

const regelwerk: Regelwerk = {
	schema_version: 'v1',
	mode: 'manual',
	action_definitions: {
		actionable: { label: 'Actionable', description: '', requires_decision: true },
		archive: { label: 'Archive', description: '', requires_decision: false },
		'archive-silent': { label: 'Silent', description: '', requires_decision: false }
	},
	priority_relevance: {
		jobsuche: {
			domain: 'job',
			max_distance_km: 50,
			fallback_unknown_plz: 'actionable'
		}
	},
	voice_consensus: {
		voices: [],
		strictness: 'strict',
		protection_clause: { on_disagreement: 'route_to_actionable_always' }
	}
};

describe('active rule presentation', () => {
	it('uses Job rules for the job-lead provenance alias', () => {
		const result = computeActiveRules('job-lead', regelwerk, userContext, [], null);

		expect(result.active_priority).toBe('jobsuche');
		expect(result.time_decay).toEqual(userContext.time_decay.job);
	});
});
