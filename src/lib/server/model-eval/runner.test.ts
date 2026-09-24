import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ModelEvalCatalog } from './catalog.js';
import {
	ModelEvalBusyError,
	readModelEvalRunStatus,
	startModelEvalRun,
	type ModelEvalRunnerConfig
} from './runner.js';

const roots: string[] = [];
const catalog: ModelEvalCatalog = {
	schema: 'folio/model-eval-catalog/v1',
	suite: { id: 'mail-triage-demo-v1', label: '40 synthetische Mails', cases: 40 },
	candidates: [{
		id: 'qwen38', label: 'Qwen 3.8', model_id: 'qwen3.8-27b-mlx', response_strip: 'code_fence',
		variant: '27B', default: true
	}]
};

function tempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'folio-model-eval-'));
	roots.push(root);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('model-eval runner', () => {
	it('runs one comparison at a time and exposes the retained result', async () => {
		const root = tempRoot();
		const fakePythonTarget = join(root, 'fake-python-target');
		const fakePython = join(root, 'fake-python');
		const runnerPath = join(root, 'runner.py');
		writeFileSync(runnerPath, '# test runner placeholder\n');
		writeFileSync(fakePythonTarget, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const state = args[args.indexOf('--state-root') + 1];
const request = JSON.parse(fs.readFileSync(args[args.indexOf('--request') + 1], 'utf8'));
const started = new Date().toISOString();
fs.writeFileSync(state + '/progress.json', JSON.stringify({schema:'folio/model-eval-progress/v1',run_id:request.run_id,phase:'evaluating',started_at:started,total_models:1,current_model:1,total_cases:40,completed_cases:20}));
setTimeout(() => {
  const finished = new Date().toISOString();
  const result = {schema:'folio/model-eval-result/v1',run_id:request.run_id,suite:request.suite,started_at:started,finished_at:finished,prior_model:null,restore_warning:null,models:[{id:'qwen38',label:'Qwen 3.8',n:40,valid:40,accuracy:0.7}]};
  fs.writeFileSync(state + '/latest.json', JSON.stringify(result));
  fs.writeFileSync(state + '/progress.json', JSON.stringify({schema:'folio/model-eval-progress/v1',run_id:request.run_id,phase:'completed',started_at:started,finished_at:finished,total_models:1,current_model:1,total_cases:40,completed_cases:40}));
}, 120);
`, { mode: 0o700 });
		chmodSync(fakePythonTarget, 0o700);
		symlinkSync(fakePythonTarget, fakePython);
		const config: ModelEvalRunnerConfig = { stateRoot: root, pythonBin: fakePython, runnerPath, cwd: root };

		expect(startModelEvalRun(['qwen38'], catalog, config).state).toBe('running');
		expect(() => startModelEvalRun(['qwen38'], catalog, config)).toThrow(ModelEvalBusyError);

		let status = readModelEvalRunStatus(config);
		for (let attempt = 0; attempt < 40 && status.state === 'running'; attempt += 1) {
			await new Promise((resolve) => setTimeout(resolve, 25));
			status = readModelEvalRunStatus(config);
		}
		expect(status).toMatchObject({
			state: 'completed',
			result: { suite: { cases: 40 }, models: [{ id: 'qwen38', accuracy: 0.7 }] }
		});
	});

	it('keeps an early worker crash visible as a failed run', async () => {
		const root = tempRoot();
		const fakePythonTarget = join(root, 'failing-python-target');
		const fakePython = join(root, 'failing-python');
		const runnerPath = join(root, 'runner.py');
		writeFileSync(runnerPath, '# test runner placeholder\n');
		writeFileSync(fakePythonTarget, '#!/bin/sh\nexit 1\n', { mode: 0o700 });
		chmodSync(fakePythonTarget, 0o700);
		symlinkSync(fakePythonTarget, fakePython);
		const config: ModelEvalRunnerConfig = { stateRoot: root, pythonBin: fakePython, runnerPath, cwd: root };

		startModelEvalRun(['qwen38'], catalog, config);
		let status = readModelEvalRunStatus(config);
		for (let attempt = 0; attempt < 20 && status.state === 'running'; attempt += 1) {
			await new Promise((resolve) => setTimeout(resolve, 20));
			status = readModelEvalRunStatus(config);
		}
		expect(status).toMatchObject({ state: 'failed', result: null });
	});
});
