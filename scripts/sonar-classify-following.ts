import { chmodSync, existsSync, lstatSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';
import { classifyFollowingBatch, type FollowingClassification } from '../src/lib/server/modules/sonar/classifier.js';
import { readSonarFollowingState } from '../src/lib/server/modules/sonar/following.js';
import { resolveTriageModel } from '../src/lib/server/agent/preflight.js';
import { getLmStudioBaseUrl } from '../src/lib/server/env.js';

const SUGGESTION_SCHEMA = 'aion-lumen/sonar-following-suggestion/v1';
const CACHE_DIRECTORY = /^following-profile-cache-\d{4}-\d{2}-\d{2}$/;
const BATCH_SIZE = 20;

interface StoredSuggestion extends FollowingClassification {
	model: string;
	generatedAt: string;
}

function argument(name: string): string | null {
	const prefix = `--${name}=`;
	return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function localOnly(baseUrl: string): void {
	const url = new URL(baseUrl);
	if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
		throw new Error('Sonar classification requires a loopback-only LM Studio URL');
	}
}

function latestCache(root: string): string {
	if (!existsSync(root)) throw new Error('Sonar archive root does not exist');
	const rootStat = lstatSync(root);
	if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Unsafe Sonar archive root');
	const resolvedRoot = realpathSync(root);
	const name = readdirSync(resolvedRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && CACHE_DIRECTORY.test(entry.name))
		.map((entry) => entry.name)
		.sort()
		.reverse()[0];
	if (!name) throw new Error('No following profile cache found');
	const directory = realpathSync(join(resolvedRoot, name));
	if (!directory.startsWith(`${resolvedRoot}${sep}`) || basename(directory) !== name) {
		throw new Error('Unsafe following profile cache path');
	}
	return directory;
}

function persist(directory: string, suggestions: readonly StoredSuggestion[]): void {
	const payload = suggestions
		.slice()
		.sort((a, b) => a.accountId.localeCompare(b.accountId))
		.map((suggestion) => JSON.stringify({
			schema: SUGGESTION_SCHEMA,
			account_id: suggestion.accountId,
			category: suggestion.category,
			confidence: suggestion.confidence,
			reason: suggestion.reason,
			model: suggestion.model,
			generated_at: suggestion.generatedAt
		}))
		.join('\n') + '\n';
	const temporary = join(directory, `.suggestions-${process.pid}.tmp`);
	writeFileSync(temporary, payload, { mode: 0o600 });
	chmodSync(temporary, 0o600);
	renameSync(temporary, join(directory, 'suggestions.ndjson'));
}

async function main() {
	const rawRoot = argument('root') ?? join(homedir(), '.folio', 'sonar');
	const root = isAbsolute(rawRoot) ? resolve(rawRoot) : resolve(process.cwd(), rawRoot);
	const directory = latestCache(root);
	const state = readSonarFollowingState(root, root);
	if (!state.sourceHealthy) throw new Error('Following profile cache is not readable');
	if (!state.suggestionsHealthy) throw new Error('Existing suggestion file is not readable');
	const existing = state.profiles
		.filter((profile) => profile.suggestion)
		.map((profile) => ({ accountId: profile.accountId, ...profile.suggestion! } satisfies StoredSuggestion));
	const remaining = state.profiles.filter((profile) => !profile.suggestion);
	if (remaining.length === 0) {
		console.log(`Sonar: ${existing.length} Vorschläge bereits vollständig.`);
		return;
	}

	const baseUrl = getLmStudioBaseUrl();
	localOnly(baseUrl);
	const requestedModel = argument('model');
	const resolved = requestedModel ?? (await resolveTriageModel()).model;
	if (!resolved) throw new Error(`LM Studio ist unter ${baseUrl} nicht bereit`);
	const suggestions = [...existing];
	for (let index = 0; index < remaining.length; index += BATCH_SIZE) {
		const batch = remaining.slice(index, index + BATCH_SIZE);
		const result = await classifyFollowingBatch(batch, resolved);
		const generatedAt = new Date().toISOString();
		suggestions.push(...result.map((suggestion) => ({ ...suggestion, model: resolved, generatedAt })));
		persist(directory, suggestions);
		console.log(`Sonar: ${Math.min(index + batch.length, remaining.length)}/${remaining.length} neu klassifiziert.`);
	}
	console.log(`Sonar: ${suggestions.length} lokale Vorschläge mit „${resolved}" gespeichert.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
