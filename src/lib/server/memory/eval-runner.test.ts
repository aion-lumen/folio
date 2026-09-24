import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	buildMemoryEvalView,
	type MemoryEvalResult,
	type MemoryEvalRunnerConfig
} from './eval-runner.js';

describe('memory model comparison', () => {
	let root = '';

	afterEach(() => {
		if (root) rmSync(root, { recursive: true, force: true });
	});

	function setup() {
		root = join(process.cwd(), 'src/lib/server/memory/.test-tmp', randomUUID());
		mkdirSync(root, { recursive: true, mode: 0o700 });
		const runId = randomUUID();
		const input = {
			feedback_id: 114,
			account_id: 'career',
			imap_uid: 42,
			sender: 'recruiting@example.invalid',
			subject: 'Bewerbung eingegangen',
			body: 'Ihre Bewerbung als Platform Lead ist bei Beispiel AG eingegangen. Fragen beantwortet Lea unter lea@example.invalid.',
			mail_domain: 'job',
			received_at: '2026-08-17T09:30:00+02:00'
		};
		writeFileSync(join(root, `request-${runId}.json`), `${JSON.stringify({
			schema: 'folio/memory-eval-request/v1',
			run_id: runId,
			models: [],
			cases: [{ case_id: 'mail-114', input, prompt: 'frozen prompt' }],
			response_format: {}
		})}\n`, { mode: 0o600 });
		const config: MemoryEvalRunnerConfig = {
			stateRoot: root,
			pythonBin: '/usr/bin/python3',
			runnerPath: '/unused/memory-eval-runner.py',
			cwd: '/unused'
		};
		return { runId, config };
	}

	function fact(value: string, evidenceQuote: string) {
		return {
			schema: 'folio/memory-candidate-proposals/v1',
			application: null,
			facts: [{
				data_class: 'context',
				subject: 'Platform Lead',
				predicate: 'has_context',
				value,
				sensitivity: 'private',
				evidence_quote: evidenceQuote,
				valid_from: null
			}]
		};
	}

	it('groups agreement, keeps a supported minority, and excludes invented evidence', () => {
		const { runId, config } = setup();
		const result: MemoryEvalResult = {
			schema: 'folio/memory-eval-result/v1',
			run_id: runId,
			started_at: '2026-08-17T10:00:00.000Z',
			finished_at: '2026-08-17T10:03:00.000Z',
			prior_model: null,
			restore_warning: null,
			models: [
				{
					id: 'qwen', label: 'Qwen', model_id: 'qwen-local', outputs: [{ case_id: 'mail-114',
						response: fact('Bewerbung eingegangen', 'Ihre Bewerbung als Platform Lead ist bei Beispiel AG eingegangen.') }]
				},
				{
					id: 'gemma', label: 'Gemma', model_id: 'gemma-local', outputs: [{ case_id: 'mail-114',
						response: fact('Bewerbung eingegangen', 'Ihre Bewerbung als Platform Lead ist bei Beispiel AG eingegangen.') }]
				},
				{
					id: 'glm', label: 'GLM', model_id: 'glm-local', outputs: [{ case_id: 'mail-114',
						response: fact('Kontakt: lea@example.invalid', 'Fragen beantwortet Lea unter lea@example.invalid.') }]
				},
				{
					id: 'unsafe', label: 'Unsafe', model_id: 'unsafe-local', outputs: [{ case_id: 'mail-114',
						response: fact('Interview am Montag', 'Ihr Interview findet am Montag statt.') }]
				}
			]
		};

		const view = buildMemoryEvalView(result, config);
		expect(view?.cases[0].models.map((model) => [model.id, model.status])).toEqual([
			['qwen', 'valid'], ['gemma', 'valid'], ['glm', 'valid'], ['unsafe', 'invalid']
		]);
		expect(view?.cases[0].candidates).toHaveLength(2);
		expect(view?.cases[0].candidates[0]).toEqual(expect.objectContaining({
			value: 'Bewerbung eingegangen', support: 2, model_ids: ['qwen', 'gemma']
		}));
		expect(view?.cases[0].candidates[1]).toEqual(expect.objectContaining({
			value: 'Kontakt: lea@example.invalid', support: 1, model_ids: ['glm']
		}));
	});
});
