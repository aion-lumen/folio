import { getFeedbackRows } from '../feedback/reader.js';
import { getLatestCorrectionMap } from '../folio-db/reader.js';
import { mailDomainReviewMapForRuns } from '../memory/domain-reviews.js';
import { buildRealMailSelectionCorpus } from '../memory/selection-corpus.js';
import { mailSelectionBaselineRunIds, readLatestMailSelectionResult } from '../memory/selection-runner.js';
import { loadModelEvalCatalog, type ModelEvalCatalog } from './catalog.js';
import { buildBalancedRealMailEvalCohort, type RealMailEvalCohort } from './real-corpus.js';

export type RealMailEvalSuite = {
	catalog: ModelEvalCatalog;
	cohort: RealMailEvalCohort;
	baselineRunIds: string[];
};

export class RealMailEvalUnavailable extends Error {}

export function buildRealMailEvalSuite(): RealMailEvalSuite {
	const selection = readLatestMailSelectionResult();
	if (!selection) throw new RealMailEvalUnavailable('Noch keine menschlich bewertete Mailkohorte vorhanden.');
	const baselineRunIds = [...mailSelectionBaselineRunIds(selection), selection.run_id];
	const reviews = mailDomainReviewMapForRuns(baselineRunIds);
	const corpus = buildRealMailSelectionCorpus(getFeedbackRows({ limit: 2_000 }), getLatestCorrectionMap());
	const cohort = buildBalancedRealMailEvalCohort(corpus, reviews, 8);
	if (cohort.cases.length < 8) throw new RealMailEvalUnavailable('Zu wenige bestätigte reale Mails für einen Vergleich.');
	const base = loadModelEvalCatalog();
	return {
		catalog: {
			...base,
			suite: {
				id: 'mail-triage-real-gold-v1',
				label: `Alltagstest · ${cohort.cases.length} menschlich bewertete Mails`,
				cases: cohort.cases.length
			}
		},
		cohort,
		baselineRunIds
	};
}
