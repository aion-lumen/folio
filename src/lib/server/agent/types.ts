export type TriageVerdict = 'task' | 'unclear' | 'not-a-task';

export interface TriageObjectiveProposal {
	title: string;
	threshold: string;
	weight: number;
	related_goals: string[];
	deadline?: string;
}

export interface TriageAssessment {
	verdict: TriageVerdict;
	confidence: number;
	chapter_slug: string | null;
	objective: TriageObjectiveProposal | null;
	reasoning: string;
	model?: string;
	guardrail_violation?: string | null;
	auto_committed?: boolean;
	committed_objective_id?: string | null;
}

export interface TriageCommitItem {
	filename: string;
	id: string;
	ok: boolean;
	message: string;
	objective_id?: string;
}

export interface TriageRunResult {
	assessed: number;
	auto_committed: TriageCommitItem[];
	awaiting_review: string[];
	skipped: TriageCommitItem[];
}
