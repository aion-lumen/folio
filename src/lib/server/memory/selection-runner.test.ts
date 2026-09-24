import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	buildMailSelectionView,
	mailSelectionBaselineRunIds,
	readMailSelectionRunStatus,
	type MailSelectionRunnerConfig,
	type MailSelectionModelResult,
	type MailSelectionResult
} from './selection-runner.js';

function model(id: string, picks: number[]): MailSelectionModelResult {
	return {
		id,
		label: id.toUpperCase(),
		model_id: `${id}-local`,
		variant: 'local',
		outputs: [{
			domain: 'shopping',
			target_count: 2,
			latency_seconds: 4.2,
			status: 'valid',
			selection: {
				schema: 'folio/memory-mail-selection/v1',
				domain: 'shopping',
				selections: picks.map((feedback_id, index) => ({
					feedback_id,
					category: index === 0 ? 'normal' : 'cross_domain',
					secondary_domains: index === 0 ? [] : ['finance'],
					reason_codes: [index === 0 ? 'routine_pattern' : 'competing_domain']
				}))
			}
		}]
	};
}

describe('Hermes mail-selection comparison', () => {
	it('ranks cross-model agreement without treating it as ground truth', () => {
		const counts = {
			immo: 0, job: 0, shopping: 12, finance: 0,
			kontakt: 0, werbung: 0, system: 0, unsorted: 0
		};
		const result: MailSelectionResult = {
			schema: 'folio/memory-selection-result/v1',
			run_id: 'run-1',
			started_at: '2026-08-17T10:00:00Z',
			finished_at: '2026-08-17T10:02:00Z',
			prior_model: null,
			restore_warning: null,
			pool_counts: counts,
			models: [model('qwen', [10, 11]), model('gemma', [10, 12]), model('glm', [10, 13])]
		};

		const view = buildMailSelectionView(result);
		const shopping = view?.domains.find((domain) => domain.domain === 'shopping');
		expect(shopping?.consensus[0]).toEqual(expect.objectContaining({
			feedback_id: 10,
			support: 3,
			model_ids: ['qwen', 'gemma', 'glm'],
			secondary_domains: [],
			reason_codes: ['routine_pattern']
		}));
		expect(shopping?.consensus.find((item) => item.feedback_id === 11)).toEqual(expect.objectContaining({
			secondary_domains: ['finance'], reason_codes: ['competing_domain']
		}));
		expect(view?.scores).toEqual([
			expect.objectContaining({ id: 'qwen', usable_domains: 1, strict_domains: 1, coverage: 1 }),
			expect.objectContaining({ id: 'gemma', usable_domains: 1, strict_domains: 1, coverage: 1 }),
			expect.objectContaining({ id: 'glm', usable_domains: 1, strict_domains: 1, coverage: 1 })
		]);
	});

	it('retains warning-bearing selections while reporting contract quality separately', () => {
		const warned = model('qwen', [10, 11]);
		warned.outputs[0].status = 'valid_with_warnings';
		warned.outputs[0].warnings = [{ code: 'trait_coverage_shortfall' }];
		warned.outputs[0].quality = {
			selected: 2, target: 2, normal: 2, boundary: 0,
			cross_domain: 0, detail_rich: 0, action_required: 0,
			deadline_present: 0, trait_quota_met: false
		};
		const result: MailSelectionResult = {
			schema: 'folio/memory-selection-result/v1', run_id: 'run-warning',
			started_at: '2026-08-19T10:00:00Z', finished_at: '2026-08-19T10:01:00Z',
			prior_model: null, restore_warning: null,
			pool_counts: { immo: 0, job: 0, shopping: 12, finance: 0, kontakt: 0, werbung: 0, system: 0, unsorted: 0 },
			models: [warned]
		};

		const view = buildMailSelectionView(result);

		expect(view?.domains.find((domain) => domain.domain === 'shopping')?.consensus).toHaveLength(2);
		expect(view?.scores[0]).toEqual(expect.objectContaining({
			usable_domains: 1, strict_domains: 0, warning_domains: 1, coverage: 1
		}));
	});

	it('purges exact raw artifacts when a detached runner died', () => {
		const root = mkdtempSync(join(tmpdir(), 'folio-memory-selection-'));
		const runId = '30c89f65-3204-436a-8acc-db22bd359201';
		const config: MailSelectionRunnerConfig = {
			stateRoot: root, pythonBin: '/unused/python', runnerPath: '/unused/runner',
			cwd: '/unused/cwd', hermesHome: '/unused/hermes'
		};
		try {
			mkdirSync(join(root, `runtime-${runId}`, 'vault'), { recursive: true });
			writeFileSync(join(root, `runtime-${runId}`, 'vault', 'mail.json'), 'raw');
			writeFileSync(join(root, `request-${runId}.json`), 'raw');
			writeFileSync(join(root, 'run.lock'), JSON.stringify({
				pid: 2147483647, startedAt: '2026-08-17T18:58:29.145Z', runId,
				logPath: join(root, `run-${runId}.log`)
			}));
			writeFileSync(join(root, 'progress.json'), JSON.stringify({
				schema: 'folio/memory-selection-progress/v1', run_id: runId, phase: 'selecting',
				started_at: '2026-08-17T18:58:29.145Z', total_models: 3, current_model: 1,
				total_domains: 8, completed_domains: 4
			}));
			writeFileSync(join(root, 'partial.json'), JSON.stringify({
				schema: 'folio/memory-selection-result/v1', run_id: runId,
				started_at: '2026-08-17T18:58:29.145Z', finished_at: '2026-08-17T19:10:00Z',
				prior_model: null, restore_warning: null,
				pool_counts: { immo: 1, job: 0, shopping: 0, finance: 0, kontakt: 0, werbung: 0, system: 0, unsorted: 0 },
				models: [model('qwen', [10, 11])]
			}));

			const status = readMailSelectionRunStatus(config);
			expect(status.state).toBe('failed');
			expect(status.state === 'failed' ? status.result?.run_id : null).toBe(runId);
			expect(existsSync(join(root, `request-${runId}.json`))).toBe(false);
			expect(existsSync(join(root, `runtime-${runId}`))).toBe(false);
			expect(existsSync(join(root, 'run.lock'))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('reports a deliberate abort separately from a failed run', () => {
		const root = mkdtempSync(join(tmpdir(), 'folio-memory-selection-'));
		const runId = '30c89f65-3204-436a-8acc-db22bd359202';
		const config: MailSelectionRunnerConfig = {
			stateRoot: root, pythonBin: '/unused/python', runnerPath: '/unused/runner',
			cwd: '/unused/cwd', hermesHome: '/unused/hermes'
		};
		try {
			writeFileSync(join(root, 'progress.json'), JSON.stringify({
				schema: 'folio/memory-selection-progress/v1', run_id: runId, phase: 'aborted',
				started_at: '2026-08-18T10:00:00Z', finished_at: '2026-08-18T10:01:00Z',
				total_models: 3, current_model: 1, total_domains: 8, completed_domains: 2
			}));

			expect(readMailSelectionRunStatus(config).state).toBe('aborted');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('resolves the frozen baseline lineage cumulatively and stops at cycles', () => {
		const root = mkdtempSync(join(tmpdir(), 'folio-memory-selection-'));
		const oldId = '30c89f65-3204-436a-8acc-db22bd359210';
		const newId = '30c89f65-3204-436a-8acc-db22bd359211';
		const currentId = '30c89f65-3204-436a-8acc-db22bd359212';
		const config: MailSelectionRunnerConfig = {
			stateRoot: root, pythonBin: '/unused/python', runnerPath: '/unused/runner',
			cwd: '/unused/cwd', hermesHome: '/unused/hermes'
		};
		const stored = (runId: string, baselineRunId: string | null): MailSelectionResult => ({
			schema: 'folio/memory-selection-result/v1', run_id: runId,
			started_at: '2026-08-19T10:00:00Z', finished_at: '2026-08-19T10:01:00Z',
			prior_model: null, restore_warning: null, baseline_run_id: baselineRunId,
			pool_counts: { immo: 0, job: 0, shopping: 0, finance: 0, kontakt: 0, werbung: 0, system: 0, unsorted: 0 },
			models: []
		});
		try {
			mkdirSync(join(root, 'results'), { recursive: true });
			writeFileSync(join(root, 'results', `${oldId}.json`), JSON.stringify(stored(oldId, null)));
			writeFileSync(join(root, 'results', `${newId}.json`), JSON.stringify(stored(newId, oldId)));
			expect(mailSelectionBaselineRunIds(stored(currentId, newId), config)).toEqual([oldId, newId]);

			writeFileSync(join(root, 'results', `${oldId}.json`), JSON.stringify(stored(oldId, newId)));
			expect(mailSelectionBaselineRunIds(stored(currentId, newId), config)).toEqual([oldId, newId]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
