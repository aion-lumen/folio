#!/usr/bin/env npx tsx
/**
 * Folio inbox triage eval — compares models x prompt variants against labeled fixtures.
 * Requires LM Studio at LM_STUDIO_BASE_URL (default http://127.0.0.1:1234).
 *
 * Usage: npm run eval:triage
 *        VAULT_PATH=./templates/demo-vault npm run eval:triage
 */
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { assessDocument } from '../../src/lib/server/agent/triage.js';
import { buildCampaignContext } from '../../src/lib/server/agent/context.js';
import type { PromptVariant } from '../../src/lib/server/agent/prompt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

interface FixtureSpec {
	file: string;
	expected: 'task' | 'unclear' | 'not-a-task';
	chapter_slug?: string;
}

interface Manifest {
	fixtures: FixtureSpec[];
	models: string[];
	prompt_variants: PromptVariant[];
}

interface FixturePrediction {
	file: string;
	expected: 'task' | 'unclear' | 'not-a-task';
	predicted: string;
	match: boolean;
}

interface ComboResult {
	model: string;
	variant: PromptVariant;
	accuracy: number;
	falsePositiveRate: number;
	falseNegativeRate: number;
	unclearRate: number;
	score: number;
	details: string[];
	// Per-fixture predictions: which fixture wobbles is now provable, not derived.
	predictions: FixturePrediction[];
}

async function main() {
	process.env.VAULT_PATH =
		process.env.VAULT_PATH ?? join(ROOT, 'templates/demo-vault');

	const manifestRaw = await readFile(join(__dirname, 'manifest.yaml'), 'utf-8');
	const manifest = parseYaml(manifestRaw) as Manifest;

	// Warm campaign context (validates vault readable)
	await buildCampaignContext();

	const results: ComboResult[] = [];

	for (const model of manifest.models) {
		for (const variant of manifest.prompt_variants) {
			let correct = 0;
			let falsePos = 0;
			let falseNeg = 0;
			let unclearPred = 0;
			const details: string[] = [];
			const predictions: FixturePrediction[] = [];

			for (const spec of manifest.fixtures) {
				const path = join(__dirname, 'fixtures', spec.file);
				const raw = await readFile(path, 'utf-8');
				const assessment = await assessDocument(spec.file, raw, {
					model,
					promptVariant: variant,
					useCache: false
				});

				const pred = assessment.verdict;
				if (pred === 'unclear') unclearPred++;

				const isCorrect = pred === spec.expected;
				predictions.push({
					file: spec.file,
					expected: spec.expected,
					predicted: pred,
					match: isCorrect
				});
				if (isCorrect) correct++;
				else {
					details.push(`${spec.file}: expected ${spec.expected}, got ${pred}`);
					// False positive: predicted task when not task (expensive — auto-creates objective)
					if (pred === 'task' && spec.expected !== 'task') falsePos++;
					if (spec.expected === 'task' && pred !== 'task') falseNeg++;
				}
			}

			const n = manifest.fixtures.length;
			const accuracy = correct / n;
			const falsePositiveRate = falsePos / n;
			const falseNegativeRate = falseNeg / n;
			const unclearRate = unclearPred / n;
			// Penalize false positives heavily (auto-commit risk)
			const score = accuracy - falsePositiveRate * 2 - falseNegativeRate * 0.5;

			results.push({
				model,
				variant,
				accuracy,
				falsePositiveRate,
				falseNegativeRate,
				unclearRate,
				score,
				details,
				predictions
			});
		}
	}

	results.sort((a, b) => b.score - a.score);

	// Aufgabe 3c: write the curated public evidence artifact. THIS is the site/CV number
	// (import-triage accuracy over the labelled fixtures) — distinct from the multi-agent
	// full-eval (40 mails, internal operating metric). Fixed path, checked in for the site link.
	const best0 = results[0];
	const stamp = new Date().toISOString().slice(0, 10);
	const resultsPayload = {
		generated_at: new Date().toISOString(),
		eval: 'import-triage',
		fixtures: manifest.fixtures.length,
		models: manifest.models,
		prompt_variants: manifest.prompt_variants,
		best: {
			model: best0.model,
			variant: best0.variant,
			accuracy: Number(best0.accuracy.toFixed(4)),
			score: Number(best0.score.toFixed(4)),
			false_positive_rate: Number(best0.falsePositiveRate.toFixed(4)),
			false_negative_rate: Number(best0.falseNegativeRate.toFixed(4))
		},
		combos: results.map((r) => ({
			model: r.model,
			variant: r.variant,
			accuracy: Number(r.accuracy.toFixed(4)),
			score: Number(r.score.toFixed(4)),
			false_positive_rate: Number(r.falsePositiveRate.toFixed(4)),
			false_negative_rate: Number(r.falseNegativeRate.toFixed(4)),
			unclear_rate: Number(r.unclearRate.toFixed(4)),
			// Per-fixture predictions per combo — makes "which fixture flipped" provable.
			fixtures: r.predictions
		}))
	};
	const resultsPath = join(__dirname, `results-${stamp}.json`);
	await writeFile(resultsPath, JSON.stringify(resultsPayload, null, 2) + '\n', 'utf-8');
	console.log(`\nResults written: ${resultsPath}`);

	console.log('\n=== Folio Triage Eval ===\n');
	console.log(
		'Model'.padEnd(28) +
			'Prompt'.padEnd(12) +
			'Acc%'.padEnd(8) +
			'FP%'.padEnd(8) +
			'FN%'.padEnd(8) +
			'Unc%'.padEnd(8) +
			'Score'
	);
	console.log('-'.repeat(80));

	for (const r of results) {
		console.log(
			r.model.padEnd(28) +
				r.variant.padEnd(12) +
				(r.accuracy * 100).toFixed(0).padStart(5) +
				'  ' +
				(r.falsePositiveRate * 100).toFixed(0).padStart(5) +
				'  ' +
				(r.falseNegativeRate * 100).toFixed(0).padStart(5) +
				'  ' +
				(r.unclearRate * 100).toFixed(0).padStart(5) +
				'  ' +
				r.score.toFixed(3)
		);
	}

	// Mismatches per combo (not only the best) — every wobbling fixture is visible in stdout.
	console.log('\n--- Mismatches per combo ---');
	for (const r of results) {
		if (r.details.length === 0) {
			console.log(`${r.model} / ${r.variant}: none`);
		} else {
			console.log(`${r.model} / ${r.variant}:`);
			for (const d of r.details) console.log(`  ${d}`);
		}
	}

	const best = results[0];
	console.log('\n--- Recommendation ---');
	console.log(`FOLIO_AGENT_MODEL=${best.model}`);
	console.log(`Prompt variant: ${best.variant}`);
	console.log('');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
