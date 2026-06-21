import { performance } from 'node:perf_hooks';
import { readAllCouncilObjects } from '../src/lib/server/council-db/reader.js';

const ITER = 25;
const userId = 1;

function p95(samples: number[]): number {
	const s = [...samples].sort((a, b) => a - b);
	return s[Math.ceil(s.length * 0.95) - 1] ?? 0;
}

const samples: number[] = [];
for (let i = 0; i < ITER; i++) {
	const t0 = performance.now();
	readAllCouncilObjects('alle', 'last_updated', userId);
	samples.push(performance.now() - t0);
}

const items = readAllCouncilObjects('alle', 'last_updated', userId);
console.log(
	JSON.stringify(
		{
			n_objects: items.length,
			iterations: ITER,
			p50_ms: samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)],
			p95_ms: p95(samples)
		},
		null,
		2
	)
);
