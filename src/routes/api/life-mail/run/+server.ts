import { error } from '@sveltejs/kit';
import { spawn } from 'child_process';
import { access, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { getLifeMailPath } from '$lib/server/env.js';
import type { RequestHandler } from './$types.js';

const HOME = homedir();
const PIPELINE = join(getLifeMailPath(), 'scripts', 'pipeline.py');
const LIFE_MAIL_DIR = getLifeMailPath();
const BW_SESSION_FILE = join(HOME, '.config', 'life', 'bw-session');

// ntfy folio-ops trigger — best-effort, same contract as life-mail/scripts/ntfy_publish.py.
const NTFY_BASE_URL = 'https://ntfy.aion-lumen.ch';
const NTFY_FOLIO_TOKEN_FILE = join(HOME, '.config', 'life', 'ntfy-folio-token');

/** Publish a folio-ops error trigger. Best-effort: a down VPS or missing token must
 *  never affect the pipeline run or the SSE response (all errors swallowed). */
async function publishFolioOpsError(account: string, code: number | null, stderrTail: string): Promise<void> {
	try {
		const token = (await readFile(NTFY_FOLIO_TOKEN_FILE, 'utf-8')).trim();
		const headers: Record<string, string> = {
			// HTTP header must be ASCII — strip non-ASCII from the title
			Title: `Mail-Run ${account} FEHLER (Code ${code})`.replace(/[^\x20-\x7E]/g, '?'),
			Priority: 'urgent'
		};
		if (token) headers.Authorization = `Bearer ${token}`;
		await fetch(`${NTFY_BASE_URL}/folio-ops`, {
			method: 'POST',
			headers,
			body: stderrTail.trim() || `pipeline exit ${code} — siehe Logs`,
			signal: AbortSignal.timeout(5000)
		});
	} catch {
		/* best-effort — never propagate */
	}
}

function buildEnv(): NodeJS.ProcessEnv {
	const userPaths = [join(HOME, '.local', 'bin'), join(HOME, 'bin')];
	const augmentedPath = [...userPaths, process.env.PATH ?? ''].join(':');
	return { ...process.env, PATH: augmentedPath, HOME };
}

async function checkBitwardenSession(): Promise<boolean> {
	try {
		const s = await stat(BW_SESSION_FILE);
		return s.size > 0;
	} catch {
		return false;
	}
}

function annotateStderr(text: string): { c: 'err' | 'warn'; x: string }[] {
	const lines: { c: 'err' | 'warn'; x: string }[] = [];
	if (text.includes("No such file or directory: 'life-mail-passwd'")) {
		lines.push({ c: 'warn', x: '[setup] life-mail-passwd nicht in PATH gefunden.' });
		lines.push({ c: 'warn', x: '[hint] Prüfe: ls -la ~/.local/bin/life-mail-passwd' });
	} else if (text.includes('bw: command not found') || text.includes('Bitwarden')) {
		lines.push({ c: 'warn', x: '[setup] Bitwarden CLI nicht verfügbar.' });
		lines.push({ c: 'warn', x: '[hint] Führe im Terminal aus: bw unlock' });
	}
	for (const line of text.split('\n')) {
		if (line.trim()) lines.push({ c: 'err', x: line.trim() });
	}
	return lines;
}

export const POST: RequestHandler = async ({ url }) => {
	try {
		await access(PIPELINE);
	} catch {
		throw error(503, 'life-mail nicht installiert oder pipeline.py nicht gefunden.');
	}

	const bwOk = await checkBitwardenSession();
	if (!bwOk) {
		throw error(400, JSON.stringify({
			error: 'bitwarden-session-missing',
			message: 'Bitwarden-Session nicht verfügbar.',
			hint: 'Führe im Terminal aus: export BW_SESSION=$(bw unlock --raw) && echo $BW_SESSION > ~/.config/life/bw-session'
		}));
	}

	const account = url.searchParams.get('account');
	if (!account) {
		throw error(400, 'Kein Account angegeben (query param ?account=<name> fehlt).');
	}

	const env = buildEnv();

	const stream = new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			const send = (data: string) => controller.enqueue(enc.encode(`data: ${data}\n\n`));
			let stderrTail = ''; // keep the last stderr for the ntfy error trigger

			const child = spawn('python3', [PIPELINE, '--account', account], {
				env,
				cwd: LIFE_MAIL_DIR,
				stdio: ['ignore', 'pipe', 'pipe']
			});

			child.stdout.on('data', (chunk: Buffer) => {
				for (const line of chunk.toString().split('\n')) {
					if (line.trim()) send(JSON.stringify({ c: 'info', x: line.trim() }));
				}
			});

			child.stderr.on('data', (chunk: Buffer) => {
				stderrTail = (stderrTail + chunk.toString()).slice(-600);
				for (const entry of annotateStderr(chunk.toString())) {
					send(JSON.stringify(entry));
				}
			});

			child.on('close', (code) => {
				if (code === 0) {
					send(JSON.stringify({ c: 'ok', x: '✓ Pipeline abgeschlossen' }));
				} else {
					send(JSON.stringify({ c: 'err', x: `✗ Pipeline beendet mit Code ${code}` }));
					// "siehe Logs" is no longer buried in the SSE panel — push a folio-ops trigger.
					void publishFolioOpsError(account, code, stderrTail);
				}
				send('[DONE]');
				controller.close();
			});

			child.on('error', (err) => {
				send(JSON.stringify({ c: 'err', x: `Fehler beim Starten: ${err.message}` }));
				void publishFolioOpsError(account, null, err.message);
				send('[DONE]');
				controller.close();
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
