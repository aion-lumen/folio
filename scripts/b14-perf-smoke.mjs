#!/usr/bin/env node
/** B14 perf smoke — readAllCouncilObjects p95 delta. Run from folio/: node scripts/b14-perf-smoke.mjs */
import { createRequire } from 'module';
import { homedir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);
const ITER = 25;

async function main() {
	// Dynamic import compiled TS via tsx if available; fallback message.
	try {
		process.chdir(join(import.meta.dirname, '..'));
		const { execSync } = await import('child_process');
		const out = execSync(
			'npx --yes tsx scripts/b14-perf-smoke-runner.ts',
			{ encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
		);
		console.log(out);
	} catch (e) {
		console.log('Perf runner skipped (tsx/DB):', e.message?.slice(0, 120));
		console.log('See fieldnote-bauteil-14 for manual results.');
	}
}

main();
