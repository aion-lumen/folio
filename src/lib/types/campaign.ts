export type CampaignStatus = 'active' | 'upcoming' | 'completed' | 'paused' | 'branched';
export type Path = 'common' | 'A' | 'B' | 'C';
export type ObjectiveStatus = 'not_started' | 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived';

export interface Campaign {
	type: 'campaign';
	layer: 'internal';
	status: CampaignStatus;
	campaign_start: string;
	campaign_horizon: string;
	total_acts: number;
	total_chapters: number;
	active_paths: Path[];
	current_act: number;
	current_chapter: number;
	body: string;
}

export interface Act {
	type: 'act';
	act_number: number;
	title: string;
	status: CampaignStatus;
	horizon_start: number;
	horizon_end: number;
	chapters: number[];
	atmosphere: string;
	key_question: string;
	image?: string;
	body: string;
}

export interface ObjectiveHistoryEntry {
	timestamp: string;
	change: string;
}

export interface Objective {
	id: string;
	title: string;
	threshold: string;
	status: ObjectiveStatus;
	weight: number;
	related_goals: string[];
	deadline?: string;
	completed_at?: string;
	progress_note?: string;
	history?: ObjectiveHistoryEntry[];
	chapter_number: number;
}

export interface Chapter {
	type: 'chapter';
	chapter_number: number;
	parent_act: number;
	title: string;
	path: Path;
	status: CampaignStatus;
	horizon_months: [number, number];
	started: string | null;
	completed: string | null;
	progress: number;
	objective_ids: string[];
	dependencies_from: number[];
	unlocks: number[];
	atmosphere: string;
	body: string;
	objectives: Objective[];
	slug: string;
}

export interface VaultData {
	campaign: Campaign;
	acts: Act[];
	chapters: Chapter[];
}
