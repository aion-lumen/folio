#!/usr/bin/env npx tsx
/**
 * inject-eval-numbers.ts — the {{EVAL_ACCURACY}} cascade mechanic (Aufgabe 3d).
 *
 * Reads a curated triage results file (results-<date>.json, produced by run.ts) and
 * replaces placeholders in a target file. THIS is the public number cascade — the
 * source is always the **import-triage** accuracy (14 fixtures), never the internal
 * multi-agent full-eval (40 mails).
 *
 * Placeholder convention (from release/0.2.0/phase2-update-entwuerfe.md):
 *   {{EVAL_ACCURACY}}          → "93 %"   (rounded percent)
 *   {{EVAL_SCORE}}             → "0.929"  (best combo score, 3 decimals)
 *   {{EVAL_FIXTURES}}          → "14"     (labelled fixture count)
 *   {{EVAL_FALSE_AUTOCOMMITS}} → "0"      (false-positive count = false auto-commits)
 *
 * Usage:
 *   npx tsx evals/triage/inject-eval-numbers.ts --file path/to/target [--results results-YYYY-MM-DD.json] [--write]
 * Without --write it prints a dry-run diff of the replacements. Scope note: this tool does
 * NOT know about carta/aion-lumen — the operator (Cowork) points --file at the site/CV files.
 */
import { readFile, writeFile, readdir } from 'fs/promises';
import { join, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ResultsFile {
	fixtures: number;
	best: { accuracy: number; score: number; false_positive_rate: number };
}

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(name);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

async function latestResults(): Promise<string> {
	const files = (await readdir(__dirname)).filter((f) => /^results-\d{4}-\d{2}-\d{2}\.json$/.test(f));
	if (files.length === 0) throw new Error('no results-<date>.json found — run npm run eval:triage first');
	files.sort();
	return join(__dirname, files[files.length - 1]);
}

async function main() {
	const file = arg('--file');
	if (!file) throw new Error('--file <target> required');
	const write = process.argv.includes('--write');

	const resultsArg = arg('--results');
	const resultsPath = resultsArg
		? isAbsolute(resultsArg)
			? resultsArg
			: join(__dirname, resultsArg)
		: await latestResults();
	const results = JSON.parse(await readFile(resultsPath, 'utf-8')) as ResultsFile;

	// Cascade values — always sourced from the import-triage result.
	const acc = `${Math.round(results.best.accuracy * 100)} %`;
	const values: Record<string, string> = {
		'{{EVAL_ACCURACY}}': acc,
		'{{EVAL_SCORE}}': results.best.score.toFixed(3),
		'{{EVAL_FIXTURES}}': String(results.fixtures),
		'{{EVAL_FALSE_AUTOCOMMITS}}': String(Math.round(results.best.false_positive_rate * results.fixtures))
	};

	const original = await readFile(file, 'utf-8');
	let out = original;
	const hits: Record<string, number> = {};
	for (const [ph, val] of Object.entries(values)) {
		const count = out.split(ph).length - 1;
		if (count > 0) {
			hits[ph] = count;
			out = out.split(ph).join(val);
		}
	}

	console.log(`source: ${resultsPath}`);
	for (const [ph, val] of Object.entries(values)) {
		console.log(`  ${ph} → "${val}"${hits[ph] ? ` (${hits[ph]}×)` : ' (0×)'}`);
	}
	if (Object.keys(hits).length === 0) {
		console.log(`No placeholders found in ${file}.`);
		return;
	}
	if (write) {
		await writeFile(file, out, 'utf-8');
		console.log(`\nWritten: ${file}`);
	} else {
		console.log(`\nDry-run (no --write). ${file} unchanged.`);
	}
}

main().catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
});
