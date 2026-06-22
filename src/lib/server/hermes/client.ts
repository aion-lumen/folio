import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { getHermesApiUrl, getHermesApiKey } from '../env.js';
import { loadCampaign, loadActiveChapter, loadAllChapters } from '../vault/reader.js';
import { getLeuchtfeuer } from '../vault/leuchtfeuer.js';

export interface ChatContext {
	view: string;
	selectedItem?: string;
	currentChapter?: number;
}

export interface HermesEvent {
	type: 'tool_call' | 'tool_result' | 'text' | 'error' | 'system_notice';
	content?: string;
	name?: string;
	args?: Record<string, unknown>;
	output?: string;
}

const MAX_SYSTEM_PROMPT_CHARS = 30000;

async function loadMemory(): Promise<string> {
	const dir = join(process.env.HOME!, '.hermes', 'memories');
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

async function buildSystemPrompt(context: ChatContext): Promise<string> {
	const [campaign, memory, leuchtfeuer] = await Promise.all([
		loadCampaign(),
		loadMemory(),
		getLeuchtfeuer().catch(() => ({ ids: [], week: 0, year: 0 }))
	]);
	const activeChapter = await loadActiveChapter(campaign.current_chapter);

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

	const dashboardContext = `Du bist Hermes, der LIFE-Agent von Afschin. Du duzt ihn (Du, dein, dir).

## Antwort-Stil
- Kurz und sachlich, keine Floskeln
- Maximal 3-4 Sätze wenn nicht explizit mehr verlangt
- Konkrete Empfehlungen statt allgemeiner Aussagen
- Auf Deutsch antworten

## Was du NICHT tun sollst

- KEIN execute_code für Vault-Operationen — nutze direkt file_read, file_write, patch, list_files
- KEIN todo-Tool für LIFE-Objectives (nur für deine internen Arbeitsschritte)
- KEIN Erfinden von Pfaden — wenn du den Pfad nicht kennst, nutze list_files
- KEIN session_search — antworte direkt basierend auf Kontext und Vault-Dateien

## Datei-Struktur des LIFE-Vaults

ROOT: ~/Projects/life/

Kapitel-Dateien (HIER leben die Objectives):
~/Projects/life/_campaign/chapters/01-repositionierung.md
~/Projects/life/_campaign/chapters/02-durchbruch.md
~/Projects/life/_campaign/chapters/03a-angestellt-etablierung.md
~/Projects/life/_campaign/chapters/03b-consultant-geschaeftsgrundlage.md
~/Projects/life/_campaign/chapters/03c-iran-orientierung.md
~/Projects/life/_campaign/chapters/04-hauskauf.md
~/Projects/life/_campaign/chapters/05-partner-weg.md
~/Projects/life/_campaign/chapters/06-zweites-einkommensfeld.md
~/Projects/life/_campaign/chapters/07-vermoegensstruktur.md
~/Projects/life/_campaign/chapters/08-unternehmerische-praesenz.md
~/Projects/life/_campaign/chapters/09-familienbasis.md
~/Projects/life/_campaign/chapters/10-produkt.md

Akt-Dateien: ~/Projects/life/_campaign/acts/01-fundament.md ... 05-vollbild.md
Master: ~/Projects/life/_campaign/campaign.md

## WICHTIG: Objectives sind KEINE eigenen Dateien

Objectives (obj-01-06 etc.) sind SEKTIONEN INNERHALB der Kapitel-Dateien.

Die erste Zahl im Objective-ID gibt die Kapitel-Nummer an:
- obj-01-XX → ~/Projects/life/_campaign/chapters/01-repositionierung.md
- obj-02-XX → ~/Projects/life/_campaign/chapters/02-durchbruch.md
- obj-04-XX → ~/Projects/life/_campaign/chapters/04-hauskauf.md
- usw.

Innerhalb der Datei sehen Objectives so aus:
### obj-01-06: Partner's Weiterbildungsweg definiert
- **threshold:** ...
- **status:** in_progress
- **weight:** 1.0
- **related_goals:** [familie]

## Workflow für Status-Änderungen mit patch

Status-Werte (NUR diese): todo | not_started | in_progress | blocked | done | archived

1. Kapitel-Datei ableiten: obj-XX-YY → chapters/XX-*.md
   (Unbekannter Dateiname: list_files auf ~/Projects/life/_campaign/chapters/)
2. file_read auf die Kapitel-Datei
3. patch mit EINDEUTIGEM old_string (siehe unten)
4. Frontmatter "updated:" auf heute setzen (eigener patch)
5. file_read zur Validierung

WICHTIG — patch verlangt EINDEUTIGE old_string-Matches. Die Status-Zeile
"- **status:** in_progress" kommt mehrfach in der Datei vor (mehrere Objectives).
Du MUSST den ### Header plus threshold-Zeile mit einschliessen.

Korrekte patch-Form — Beispiel obj-01-06 → done:

old_string:
### obj-01-06: Partner's Weiterbildungsweg definiert
- **threshold:** Ein konkreter Weg ist identifiziert und besprochen (Ausbildung, Studium, Kurs, Einstieg), auch wenn noch nicht gestartet
- **status:** in_progress

new_string:
### obj-01-06: Partner's Weiterbildungsweg definiert
- **threshold:** Ein konkreter Weg ist identifiziert und besprochen (Ausbildung, Studium, Kurs, Einstieg), auch wenn noch nicht gestartet
- **status:** done
- **completed_at:** YYYY-MM-DD

Regeln:
- old_string MUSS die ### Header-Zeile enthalten (macht Match eindeutig)
- threshold-Zeile ZEICHENGENAU aus file_read übernehmen
- completed_at VOR -weight- einfügen
- NICHT replace_all=True nutzen (gefährlich bei mehreren Objectives)
- Wenn patch scheitert mit "Found N matches": old_string um mehr Zeilen nach oben erweitern

Fallback (nur wenn patch nicht klappt): file_read → im Kopf ändern → file_write komplett zurück

Bei reinen Beratungs-Fragen: Lies die relevante Vault-Datei bevor du antwortest.
Verlasse dich nicht auf Memory allein — der aktuelle Stand steht im Vault.

## Leuchtfeuer KW ${leuchtfeuer.week} (${leuchtfeuer.year})
${
	leuchtfeuer.ids.length > 0
		? `Die drei Prioritäten dieser Woche:\n${leuchtfeuer.ids
				.map((id) => {
					const obj = (activeChapter?.objectives ?? []).find((o) => o.id === id);
					return obj
						? `- ${id} "${obj.title}" (Status: ${obj.status}${obj.deadline ? `, Deadline: ${obj.deadline}` : ''})`
						: `- ${id}`;
				})
				.join('\n')}\n\nWenn der Nutzer "diese Woche", "Leuchtfeuer", "Prioritäten" o.ä. sagt, bezieht er sich auf diese Objectives.`
		: '(noch keine Leuchtfeuer für diese Woche gesetzt)'
}

## Aktueller Dashboard-Kontext
View: ${context.view}${context.selectedItem ? `\nAusgewähltes Item: ${context.selectedItem}` : ''}
Datum: ${new Date().toLocaleDateString('de-DE')}

## Aktive Kampagne
Akt ${campaign.current_act}, Kapitel ${campaign.current_chapter}${activeChapter ? `: ${activeChapter.title}\n"${activeChapter.atmosphere}"` : ''}

## Objectives in Bearbeitung (${inProgress.split('\n').filter(Boolean).length})
${inProgress || '(keine in_progress)'}

## Nächste offene Objectives
${todo || '(keine)'}

## Vault-Pfad
~/Projects/life/ — wenn du Details zu einem Objective brauchst, lies ~/Projects/life/_campaign/chapters/`;

	const full = memory ? `${memory}\n\n${dashboardContext}` : dashboardContext;
	if (full.length > MAX_SYSTEM_PROMPT_CHARS) {
		console.warn(`[hermes] system prompt truncated: ${full.length} → ${MAX_SYSTEM_PROMPT_CHARS}`);
		return full.slice(0, MAX_SYSTEM_PROMPT_CHARS);
	}
	return full;
}

export interface HistoryMessage {
	role: 'user' | 'assistant';
	content: string;
}

async function buildSelectedContext(selectedObjectiveIds: string[]): Promise<string> {
	if (selectedObjectiveIds.length === 0) return '';
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

export async function sendMessage(
	message: string,
	context: ChatContext,
	history: HistoryMessage[] = [],
	selectedObjectiveIds: string[] = []
): Promise<HermesEvent[]> {
	const [instructions, selectedContext] = await Promise.all([
		buildSystemPrompt(context),
		buildSelectedContext(selectedObjectiveIds)
	]);
	const fullInstructions = selectedContext
		? `${instructions}${selectedContext}`
		: instructions;

	const body = {
		model: 'default',
		input: message,
		instructions: fullInstructions,
		conversation: 'folio-vault-chat',
		store: true
	};

	const response = await fetch(`${getHermesApiUrl()}/v1/responses`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${getHermesApiKey()}`
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const errText = await response.text().catch(() => response.statusText);
		const isStaleChain =
			response.status === 404 && errText.includes('Previous response not found');
		if (!isStaleChain) {
			throw new Error(`Hermes error: ${response.status} — ${errText}`);
		}

		// Hermes' conversation pointer (`response_store.db:conversations`) references
		// a response_id that's no longer in the responses table — happens when the
		// response TTL prunes the row but the pointer is left behind. Clear the orphan
		// pointer (surgical DELETE on the row Hermes just told us is broken), then
		// retry with the original body. Hermes then treats the conversation name as
		// fresh, stores the new response, and self-heals the pointer. Prepend a
		// system_notice so the user sees the chain was reset.
		console.warn(
			'[hermes/client] orphan previous_response_id detected, clearing pointer + retrying'
		);
		clearHermesConversationPointer(body.conversation);

		const retry = await fetch(`${getHermesApiUrl()}/v1/responses`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${getHermesApiKey()}`
			},
			body: JSON.stringify(body)
		});

		if (!retry.ok) {
			const retryErr = await retry.text().catch(() => retry.statusText);
			throw new Error(
				`Hermes error (after orphan clear + retry): ${retry.status} — ${retryErr}`
			);
		}

		const retryEvents: HermesEvent[] = [
			{
				type: 'system_notice',
				content:
					'Chat-Verlauf zurückgesetzt (Hermes Response Chain unterbrochen). Antwort folgt als neuer Thread.'
			}
		];
		retryEvents.push(...parseHermesOutput(await retry.json()));
		return retryEvents;
	}

	return parseHermesOutput(await response.json());
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

function parseHermesOutput(data: { output?: unknown[] }): HermesEvent[] {
	const output: unknown[] = data.output ?? [];
	const events: HermesEvent[] = [];

	for (const item of output) {
		const it = item as Record<string, unknown>;
		if (it.type === 'function_call') {
			let args: Record<string, unknown> = {};
			try {
				args = JSON.parse(it.arguments as string);
			} catch {
				args = { raw: it.arguments };
			}
			events.push({ type: 'tool_call', name: it.name as string, args });
		} else if (it.type === 'function_call_output') {
			// find matching tool_call name
			const callId = it.call_id as string;
			const matchingCall = (output as Record<string, unknown>[]).find(
				(o) => o.type === 'function_call' && o.call_id === callId
			);
			const outputStr =
				typeof it.output === 'string' ? it.output : JSON.stringify(it.output);
			events.push({
				type: 'tool_result',
				name: (matchingCall?.name as string) ?? 'tool',
				output: outputStr.slice(0, 1000)
			});
		} else if (it.type === 'message') {
			const contents = (it.content as { type: string; text?: string }[]) ?? [];
			const text = contents
				.filter((c) => c.type === 'output_text')
				.map((c) => c.text ?? '')
				.join('');
			if (text) events.push({ type: 'text', content: text });
		}
	}

	if (events.length === 0) {
		events.push({ type: 'text', content: '(keine Antwort)' });
	}
	return events;
}
