import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import {
	getHermesApiUrl,
	getHermesApiKey,
	getHermesHomePath,
	getVaultPath,
	isDemoVaultActive
} from '../env.js';
import { readHermesExecutionProfile } from './execution-profile.js';
import type { ExecutionProfile } from '$lib/types/execution-profile.js';
import { finishHermesTurn, startHermesTurn } from '../folio-db/writer.js';
import {
	readHermesContextManifest,
	renderManifestText,
	type HermesContextManifest
} from './context-manifest.js';

// Per-vault conversation identity. The gateway keys stored history by this name;
// deriving it from the ACTIVE vault root means the demo vault and a private vault
// can NEVER share a conversation (and thus never replay each other's history).
// A fixed name was the root cause of the cross-vault history leak.
function vaultFingerprint(): string {
	return createHash('sha256').update(getVaultPath()).digest('hex').slice(0, 12);
}

function vaultConversationName(sessionId?: string): string {
	const vault = vaultFingerprint();
	if (!sessionId) return `folio-vault-${vault}`;
	const session = createHash('sha256').update(sessionId).digest('hex').slice(0, 12);
	return `folio-vault-${vault}-${session}`;
}
import { loadCampaign, loadActiveChapter, loadAllChapters } from '../vault/reader.js';
import { getLeuchtfeuer } from '../vault/leuchtfeuer.js';

export interface ChatContext {
	view: string;
	selectedItem?: string;
	currentChapter?: number;
}

export interface HermesEvent {
	type: 'tool_call' | 'tool_result' | 'text' | 'error' | 'system_notice' | 'execution_profile';
	content?: string;
	name?: string;
	args?: Record<string, unknown>;
	output?: string;
	profile?: ExecutionProfile;
}

async function loadMemory(): Promise<string> {
	const dir = join(getHermesHomePath(), 'memories');
	try {
		const [user, memory] = await Promise.all([
			readFile(join(dir, 'USER.md'), 'utf-8').catch(() => ''),
			readFile(join(dir, 'MEMORY.md'), 'utf-8').catch(() => '')
		]);
		const parts: string[] = [];
		if (user.trim()) parts.push(`## Über Afschin\n${user.trim()}`);
		if (memory.trim()) parts.push(`## System-Memory\n${memory.trim()}`);
		return parts.join('\n\n');
	} catch {
		return '';
	}
}

async function buildSystemPrompt(
	context: ChatContext,
	manifest: HermesContextManifest
): Promise<string> {
	// Active vault root (demo or the user's own) — NEVER hardcode a private path
	// here. The gateway scopes the file tools to exactly this root (see the
	// `vault_root` field below + the gateway-side jail), so prompt and tool
	// surface must agree on the SAME active vault.
	const vaultRoot = getVaultPath();
	const needsCampaign = manifest.sources.campaign || manifest.sources.leuchtfeuer;
	const [campaign, memory, leuchtfeuer] = await Promise.all([
		needsCampaign ? loadCampaign() : Promise.resolve(null),
		manifest.sources.memory && !isDemoVaultActive() ? loadMemory() : Promise.resolve(''),
		manifest.sources.leuchtfeuer
			? getLeuchtfeuer().catch(() => ({ ids: [], week: 0, year: 0 }))
			: Promise.resolve(null)
	]);
	const activeChapter = campaign ? await loadActiveChapter(campaign.current_chapter) : null;

	const inProgress = (activeChapter?.objectives ?? [])
		.filter((o) => o.status === 'in_progress')
		.map(
			(o) =>
				`- [${o.id}] ${o.title}` +
				(o.deadline ? ` (Deadline ${o.deadline})` : '') +
				(o.progress_note ? ` — ${o.progress_note}` : '')
		)
		.join('\n');

	const todo = (activeChapter?.objectives ?? [])
		.filter((o) => o.status === 'todo' || o.status === 'not_started')
		.slice(0, 5)
		.map((o) => `- [${o.id}] ${o.title}`)
		.join('\n');

	const sections: string[] = [];
	if (memory) sections.push(memory);
	sections.push(manifest.identity);
	sections.push(`## Antwort-Stil\n${manifest.responseStyle.map((item) => `- ${item}`).join('\n')}`);
	sections.push(`## Was du NICHT tun sollst\n${manifest.prohibitions.map((item) => `- ${item}`).join('\n')}`);

	if (manifest.sources.vaultGuidance) {
		const chapterFiles = manifest.vaultGuidance.chapterFiles
			.map((file) => `${vaultRoot.replace(/\/$/, '')}/${file}`)
			.join('\n');
		sections.push(`## Datei-Struktur des LIFE-Vaults
ROOT: ${vaultRoot}/

Kapitel-Dateien (HIER leben die Objectives):
${chapterFiles}

Akt-Dateien: ${vaultRoot}/_campaign/acts/01-fundament.md ... 05-vollbild.md
Master: ${vaultRoot}/_campaign/campaign.md`);
		sections.push(
			`## WICHTIG: Objectives sind KEINE eigenen Dateien\n${renderManifestText(manifest.vaultGuidance.objectiveModel, vaultRoot)}`
		);
		sections.push(
			`## Workflow für Status-Änderungen mit patch\n${renderManifestText(manifest.vaultGuidance.statusWorkflow, vaultRoot)}`
		);
	}

	if (leuchtfeuer) {
		const priorities =
			leuchtfeuer.ids.length > 0
				? `Die drei Prioritäten dieser Woche:\n${leuchtfeuer.ids
						.map((id) => {
							const obj = (activeChapter?.objectives ?? []).find((o) => o.id === id);
							return obj
								? `- ${id} "${obj.title}" (Status: ${obj.status}${obj.deadline ? `, Deadline: ${obj.deadline}` : ''})`
								: `- ${id}`;
						})
						.join('\n')}\n\nWenn der Nutzer "diese Woche", "Leuchtfeuer", "Prioritäten" o.ä. sagt, bezieht er sich auf diese Objectives.`
				: '(noch keine Leuchtfeuer für diese Woche gesetzt)';
		sections.push(`## Leuchtfeuer KW ${leuchtfeuer.week} (${leuchtfeuer.year})\n${priorities}`);
	}

	if (manifest.sources.dashboard) {
		sections.push(`## Aktueller Dashboard-Kontext
View: ${context.view}${context.selectedItem ? `\nAusgewähltes Item: ${context.selectedItem}` : ''}
Datum: ${new Date().toLocaleDateString('de-DE')}`);
	}

	if (manifest.sources.campaign && campaign) {
		sections.push(`## Aktive Kampagne
Akt ${campaign.current_act}, Kapitel ${campaign.current_chapter}${activeChapter ? `: ${activeChapter.title}\n"${activeChapter.atmosphere}"` : ''}`);
		sections.push(`## Objectives in Bearbeitung (${inProgress.split('\n').filter(Boolean).length})
${inProgress || '(keine in_progress)'}`);
		sections.push(`## Nächste offene Objectives\n${todo || '(keine)'}`);
	}

	if (manifest.sources.vaultGuidance) {
		sections.push(
			`## Vault-Pfad\n${vaultRoot}/ — wenn du Details zu einem Objective brauchst, lies ${vaultRoot}/_campaign/chapters/`
		);
	}

	const full = sections.join('\n\n');
	if (full.length > manifest.maxChars) {
		console.warn(`[hermes] system prompt truncated: ${full.length} → ${manifest.maxChars}`);
		return full.slice(0, manifest.maxChars);
	}
	return full;
}

export interface HistoryMessage {
	role: 'user' | 'assistant';
	content: string;
}

export interface HermesCorrelation {
	sessionId: string;
	turnId: string;
}

async function buildSelectedContext(
	selectedObjectiveIds: string[],
	manifest: HermesContextManifest
): Promise<string> {
	if (!manifest.sources.selectedObjectives || selectedObjectiveIds.length === 0) return '';
	const chapters = await loadAllChapters();
	const allObjectives = chapters.flatMap((c) => c.objectives);
	const selected = selectedObjectiveIds
		.map((id) => allObjectives.find((o) => o.id === id))
		.filter(Boolean);
	if (selected.length === 0) return '';
	const lines = selected.map(
		(o) =>
			`- ${o!.id} "${o!.title}" (Status: ${o!.status}${o!.deadline ? `, Deadline: ${o!.deadline}` : ''})`
	);
	return `\n## Vom Nutzer ausgewählte Objectives (${selected.length})\n${lines.join('\n')}\n\nWenn der Nutzer "das", "diese", "diesen Task" o.ä. ohne weitere Spezifikation sagt, bezieht er sich auf diese Auswahl. Bei Aktionen auf mehrere Items arbeite sie der Reihe nach ab.`;
}

// Idle-timeout (replaces the old fixed 30s total timeout): the gateway emits
// `: keepalive` every 30s even during silent phases (e.g. ~67s context
// compression), so a per-chunk idle timer lets legitimate long turns stream on
// while a true stall (no token AND no keepalive) is caught fast.
const IDLE_TIMEOUT_MS = 45_000;

// Marker: the gateway's conversation pointer is orphaned (HTTP 404 before the
// stream starts) → caller clears it and retries once.
class StaleChainError extends Error {}
class StreamAbortedError extends Error {}

function connectionError(e: unknown, externalSignal?: AbortSignal): Error {
	if (externalSignal?.aborted) return new StreamAbortedError('client disconnected or cancelled');
	if (e instanceof Error && e.name === 'AbortError') {
		return new Error(
			`Hermes stalled — no output for ${IDLE_TIMEOUT_MS / 1000}s. The model or gateway may be stuck.`
		);
	}
	return new Error(`Could not reach the Hermes gateway at ${getHermesApiUrl()} — is it running?`);
}

// Map one parsed OpenAI-Responses SSE event object to a folio HermesEvent.
// Text arrives as deltas (the chat store merges consecutive text events).
function mapStreamEvent(
	obj: Record<string, unknown>,
	toolNames: Map<string, string>
): HermesEvent | null {
	const t = obj.type as string;
	if (t === 'response.output_text.delta') {
		const delta = obj.delta;
		return delta ? { type: 'text', content: String(delta) } : null;
	}
	if (t === 'response.output_item.done') {
		const item = obj.item as Record<string, unknown> | undefined;
		if (!item) return null;
		if (item.type === 'function_call') {
			if (item.call_id && item.name) toolNames.set(item.call_id as string, item.name as string);
			let args: Record<string, unknown> = {};
			try {
				args = JSON.parse((item.arguments as string) ?? '{}');
			} catch {
				args = { raw: item.arguments };
			}
			return { type: 'tool_call', name: item.name as string, args };
		}
		if (item.type === 'function_call_output') {
			const outStr =
				typeof item.output === 'string' ? item.output : JSON.stringify(item.output);
			return {
				type: 'tool_result',
				name: toolNames.get(item.call_id as string) ?? 'tool',
				output: outStr.slice(0, 1000)
			};
		}
		return null; // message item.done — text already streamed via deltas
	}
	if (t === 'response.failed' || t === 'error') {
		const resp = obj.response as { error?: { message?: string } } | undefined;
		const err = obj.error as { message?: string } | undefined;
		return {
			type: 'error',
			content: String(resp?.error?.message ?? err?.message ?? obj.message ?? 'Hermes stream failed')
		};
	}
	return null; // response.created / output_item.added / output_text.done / response.completed
}

// Extract the JSON payload from one SSE frame (lines until a blank line).
// Comment frames (`: keepalive`) and event-only frames yield no payload.
function parseSseFrame(frame: string): Record<string, unknown> | null {
	const dataLines = frame
		.split('\n')
		.filter((l) => l.startsWith('data:'))
		.map((l) => l.slice(5).replace(/^ /, ''));
	if (dataLines.length === 0) return null;
	const payload = dataLines.join('\n');
	if (payload === '[DONE]') return null;
	try {
		return JSON.parse(payload);
	} catch {
		return null;
	}
}

// Open a streaming /v1/responses request and yield mapped events as they arrive.
// externalSignal (from the SSE route) aborts the gateway stream if the browser
// disconnects.
async function* openResponseStream(
	body: object,
	externalSignal?: AbortSignal
): AsyncGenerator<HermesEvent> {
	const controller = new AbortController();
	if (externalSignal) {
		if (externalSignal.aborted) controller.abort();
		else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
	}
	let idle: ReturnType<typeof setTimeout> | undefined;
	const armIdle = () => {
		if (idle) clearTimeout(idle);
		idle = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
	};

	armIdle();
	let response: Response;
	try {
		response = await fetch(`${getHermesApiUrl()}/v1/responses`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'text/event-stream',
				Authorization: `Bearer ${getHermesApiKey()}`
			},
			body: JSON.stringify(body),
			signal: controller.signal
		});
	} catch (e) {
		if (idle) clearTimeout(idle);
		throw connectionError(e, externalSignal);
	}

	if (!response.ok || !response.body) {
		if (idle) clearTimeout(idle);
		const errText = await response.text().catch(() => response.statusText);
		if (response.status === 404 && errText.includes('Previous response not found')) {
			throw new StaleChainError();
		}
		throw new Error(`Hermes error: ${response.status} — ${errText}`);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const toolNames = new Map<string, string>();
	let buffer = '';
	let sawAny = false;
	let done = false;

	try {
		while (!done) {
			let chunk: ReadableStreamReadResult<Uint8Array>;
			try {
				chunk = await reader.read();
			} catch (e) {
				if (controller.signal.aborted) throw connectionError(e, externalSignal);
				throw connectionError(e, externalSignal);
			}
			armIdle(); // reset on ANY bytes — data event OR `: keepalive` comment
			if (chunk.done) break;
			buffer += decoder.decode(chunk.value, { stream: true });
			let sep: number;
			while ((sep = buffer.indexOf('\n\n')) !== -1) {
				const frame = buffer.slice(0, sep);
				buffer = buffer.slice(sep + 2);
				const obj = parseSseFrame(frame);
				if (!obj) continue;
				const ev = mapStreamEvent(obj, toolNames);
				if (ev) {
					sawAny = true;
					yield ev;
				}
				if (obj.type === 'response.completed' || obj.type === 'response.failed') done = true;
			}
		}
	} finally {
		if (idle) clearTimeout(idle);
		reader.cancel().catch(() => {});
	}

	if (!sawAny) yield { type: 'text', content: '(keine Antwort)' };
}

export async function* sendMessage(
	message: string,
	context: ChatContext,
	// history is tracked server-side via the named conversation (+ store), so it
	// is not sent in the body; kept in the signature for call-site compatibility.
	_history: HistoryMessage[] = [],
	selectedObjectiveIds: string[] = [],
	correlation?: HermesCorrelation,
	signal?: AbortSignal
): AsyncGenerator<HermesEvent> {
	const manifest = await readHermesContextManifest();
	const executionProfile = await readHermesExecutionProfile({
		version: manifest.promptVersion,
		fingerprint: manifest.fingerprint
	});
	const conversation = vaultConversationName(correlation?.sessionId);
	let turnStarted = false;
	let turnFinished = false;
	if (correlation) {
		startHermesTurn({
			session_id: correlation.sessionId,
			turn_id: correlation.turnId,
			conversation_id: conversation,
			vault_fingerprint: vaultFingerprint(),
			objective_ids: selectedObjectiveIds,
			execution_profile: executionProfile
		});
		turnStarted = true;
	}

	// Stamp every assistant turn with the exact safe execution profile observed at
	// request start. This survives later model switches and never contains credentials.
	try {
		yield {
			type: 'execution_profile',
			profile: executionProfile
		};

		const [instructions, selectedContext] = await Promise.all([
			buildSystemPrompt(context, manifest),
			buildSelectedContext(selectedObjectiveIds, manifest)
		]);
		const fullInstructions = selectedContext ? `${instructions}${selectedContext}` : instructions;

		const body = {
			model: 'default',
			input: message,
			instructions: fullInstructions,
			conversation,
			store: true,
			stream: true,
			// Scope the gateway's file tools to the ACTIVE vault. The gateway pins this
			// as the per-request working root and jails read_file/write_file to it, so
			// the agent cannot read or write outside the active (e.g. demo) vault — even
			// if a prompt, the user, or an injection names an absolute/~ path elsewhere.
			vault_root: getVaultPath()
		};

		let responseError: string | null = null;
		try {
			for await (const event of openResponseStream(body, signal)) {
				if (event.type === 'error') responseError = event.content ?? 'Hermes stream failed';
				yield event;
			}
		} catch (e) {
			if (!(e instanceof StaleChainError)) throw e;
			// Compatibility fallback for an orphaned Hermes response pointer. Folio's
			// own session/turn audit remains authoritative and is not modified here.
			console.warn(
				'[hermes/client] orphan previous_response_id detected, clearing pointer + retrying'
			);
			clearHermesConversationPointer(body.conversation);
			yield {
				type: 'system_notice',
				content:
					'Chat-Verlauf zurückgesetzt (Hermes Response Chain unterbrochen). Antwort folgt als neuer Thread.'
			};
			for await (const event of openResponseStream(body, signal)) {
				if (event.type === 'error') responseError = event.content ?? 'Hermes stream failed';
				yield event;
			}
		}
		if (turnStarted && correlation) {
			finishHermesTurn(
				correlation.turnId,
				responseError ? 'failed' : 'completed',
				responseError
			);
			turnFinished = true;
		}
	} catch (e) {
		if (turnStarted && correlation) {
			finishHermesTurn(
				correlation.turnId,
				e instanceof StreamAbortedError ? 'aborted' : 'failed',
				e instanceof Error ? e.message : String(e)
			);
			turnFinished = true;
		}
		throw e;
	} finally {
		// Async-generator cancellation can bypass the catch block. Keep Folio's
		// audit honest if the browser disconnects while the generator is suspended.
		if (turnStarted && !turnFinished && correlation) {
			finishHermesTurn(correlation.turnId, 'aborted', 'stream interrupted');
		}
	}
}

// Reset the active vault's conversation: drop the gateway pointer so the next
// turn starts a fresh thread (no replayed history). Used by "New chat".
export function resetConversation(): void {
	clearHermesConversationPointer(vaultConversationName());
}

function clearHermesConversationPointer(name: string): void {
	// Hermes' response_store.db is shared state. Hermes runs WAL-mode sqlite, so a
	// concurrent DELETE from another process is safe. The DELETE is a no-op if the
	// row is already gone.
	try {
		const dbPath = join(homedir(), '.hermes', 'response_store.db');
		const db = new Database(dbPath);
		db.prepare('DELETE FROM conversations WHERE name = ?').run(name);
		db.close();
	} catch (e) {
		// Non-fatal: the retry still happens; the next call may show system_notice
		// again, but the user-facing error stays a system_notice rather than a 404.
		console.warn('[hermes/client] could not clear orphan conversation pointer:', e);
	}
}
