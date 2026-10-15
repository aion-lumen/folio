import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	readSonarSearchRunStatus,
	SonarSearchBusyError,
	startSonarSearchRun,
	type SonarSearchRunnerConfig
} from './search-runner.js';

const roots: string[] = [];

function root(): string {
	const path = mkdtempSync(join(tmpdir(), 'folio-sonar-runner-'));
	roots.push(path);
	return path;
}

afterEach(() => {
	for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('Sonar manual search runner', () => {
	it('reports an unconfigured idle state without starting anything', () => {
		const config: SonarSearchRunnerConfig = { runnerPath: null, stateRoot: root() };
		expect(readSonarSearchRunStatus(config)).toEqual({ state: 'idle', configured: false });
		expect(() => startSonarSearchRun(config)).toThrow('not configured');
	});

	it('retains bookmark source counts in the shared completed status', async () => {
		const stateRoot = root(), runnerPath = join(stateRoot, 'bookmarks.sh');
		writeFileSync(runnerPath, `#!/bin/sh
printf '%s\\n' '{"queries":3,"fetched":40,"liked":20,"bookmarked":20,"searched":10,"eligible":2,"selected":0,"created":[],"acquisition":"likes+bookmarks+search","estimated_post_read_cost_usd":0.09,"notification":"skipped"}'
`, { mode: 0o700 });
		const config = { stateRoot, runnerPath };
		startSonarSearchRun(config);
		let status = readSonarSearchRunStatus(config);
		for (let i = 0; i < 30 && status.state === 'running'; i++) {
			await new Promise(resolve => setTimeout(resolve, 25));
			status = readSonarSearchRunStatus(config);
		}
		expect(status).toMatchObject({ state: 'completed', summary: { bookmarked: 20, acquisition: 'likes+bookmarks+search' } });
	});

	it('runs one executable at a time and retains only an aggregate result', async () => {
		const stateRoot = root();
		const runnerPath = join(stateRoot, 'runner.sh');
		writeFileSync(
			runnerPath,
			'#!/bin/sh\nsleep 0.15\nprintf \'%s\\n\' \'{"queries":2,"fetched":13,"liked":3,"searched":10,"eligible":4,"selected":2,"created":["x-1"],"acquisition":"likes+search","estimated_post_read_cost_usd":0.053,"notification":"sent"}\'\n',
			{ encoding: 'utf8', mode: 0o700 }
		);
		chmodSync(runnerPath, 0o700);
		const config: SonarSearchRunnerConfig = { runnerPath, stateRoot };
		const started = startSonarSearchRun(config);
		expect(started.state).toBe('running');
		expect(() => startSonarSearchRun(config)).toThrow(SonarSearchBusyError);

		let status = readSonarSearchRunStatus(config);
		for (let attempt = 0; attempt < 30 && status.state === 'running'; attempt += 1) {
			await new Promise((resolve) => setTimeout(resolve, 25));
			status = readSonarSearchRunStatus(config);
		}
		expect(status).toMatchObject({
			state: 'completed',
			configured: true,
			summary: {
				queries: 2, fetched: 13, liked: 3, searched: 10, eligible: 4, selected: 2,
				created: 1, acquisition: 'likes+search', estimatedPostReadCostUsd: 0.053, notification: 'sent'
			}
		});
	});
});

describe('Bounded shared runner', () => {
 it('terminates a hung run and preserves a visible failure without retrying', async () => {
  const stateRoot=root(),runnerPath=join(stateRoot,'hang.sh');
  writeFileSync(runnerPath,'#!/bin/sh\nsleep 30\n',{mode:0o700});
  const config={stateRoot,runnerPath,timeoutMs:100};
  startSonarSearchRun(config);
  await new Promise(resolve=>setTimeout(resolve,250));
  expect(readSonarSearchRunStatus(config)).toMatchObject({state:'failed',message:expect.stringContaining('Zeitlimit')});
  expect(existsSync(join(stateRoot,'run.lock'))).toBe(false);
 });
 it('does not steal a just-created incomplete lock', () => {
  const stateRoot=root(); writeFileSync(join(stateRoot,'run.lock'),'');
  expect(readSonarSearchRunStatus({stateRoot,runnerPath:'/unused'}).state).toBe('running');
  expect(existsSync(join(stateRoot,'run.lock'))).toBe(true);
 });
});
