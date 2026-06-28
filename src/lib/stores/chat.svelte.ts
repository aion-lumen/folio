export interface ChatEvent {
	type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'system_notice';
	content?: string;
	name?: string;
	args?: Record<string, unknown>;
	output?: string;
}

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant';
	events: ChatEvent[];
	streaming?: boolean;
}

const STORAGE_KEY = 'folio-chat';
const MAX_MESSAGES = 100;

function loadFromStorage(): ChatMessage[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed: ChatMessage[] = JSON.parse(raw);
			// Strip any streaming flags left from a previous crash
			return parsed.map((m) => ({ ...m, streaming: false }));
		}
	} catch {
		// ignore
	}
	return [];
}

/** Flatten a message's events to a plain text string for Hermes history. */
function eventsToText(events: ChatEvent[]): string {
	return events
		.filter((e) => e.type === 'text')
		.map((e) => e.content ?? '')
		.join('');
}

class ChatStore {
	messages = $state<ChatMessage[]>([]);
	open = $state(false);
	loading = $state(false);
	context = $state({ view: 'strategic', selectedItem: '', currentChapter: 1 });

	constructor() {
		if (typeof window !== 'undefined') {
			this.messages = loadFromStorage();
		}
	}

	private saveToStorage() {
		if (typeof window === 'undefined') return;
		try {
			const toSave = this.messages
				.slice(-MAX_MESSAGES)
				.map((m) => ({ ...m, streaming: false }));
			localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
		} catch {
			// localStorage full or unavailable
		}
	}

	toggle() {
		this.open = !this.open;
	}

	setContext(ctx: Partial<typeof this.context>) {
		this.context = { ...this.context, ...ctx };
	}

	clear() {
		this.messages = [];
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore
		}
	}

	/** Start a fresh conversation: reset the gateway pointer (server-side history)
	 *  AND clear the local messages. Clearing only locally would leave the gateway
	 *  replaying the old thread. */
	async newChat() {
		try {
			await fetch('/api/hermes/reset', { method: 'POST' });
		} catch {
			// non-fatal: still clear locally; a stale pointer self-heals on next orphan
		}
		this.clear();
	}

	/** Build conversation history for Hermes (excludes the latest user message). */
	private buildHistory() {
		return this.messages
			.filter((m) => !m.streaming)
			.map((m) => ({
				role: m.role as 'user' | 'assistant',
				content: eventsToText(m.events)
			}))
			.filter((m) => m.content.trim().length > 0);
	}

	async send(message: string, selectedObjectiveIds: string[] = []) {
		if (!message.trim() || this.loading) return;

		// Snapshot history BEFORE adding the new user message
		const history = this.buildHistory();

		this.messages.push({
			id: crypto.randomUUID(),
			role: 'user',
			events: [{ type: 'text', content: message }]
		});
		this.loading = true;

		const assistantId = crypto.randomUUID();
		this.messages.push({ id: assistantId, role: 'assistant', events: [], streaming: true });

		try {
			const res = await fetch('/api/hermes/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message,
					context: this.context,
					history,
					selectedObjectiveIds
				})
			});

			if (!res.ok) {
				let detail = `Request failed (${res.status})`;
				try {
					const j = await res.json();
					if (j?.message) detail = j.message;
				} catch {
					// non-JSON error body — keep the status-based message
				}
				throw new Error(detail);
			}

			const reader = res.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const data = line.slice(6).trim();
					if (data === '[DONE]') break;
					try {
						const event: ChatEvent = JSON.parse(data);
						const idx = this.messages.findIndex((m) => m.id === assistantId);
						if (idx !== -1) {
							const events = [...this.messages[idx].events];
							if (
								event.type === 'text' &&
								events.length > 0 &&
								events[events.length - 1].type === 'text'
							) {
								events[events.length - 1] = {
									...events[events.length - 1],
									content: (events[events.length - 1].content ?? '') + (event.content ?? '')
								};
							} else {
								events.push(event);
							}
							this.messages[idx] = { ...this.messages[idx], events };
						}
					} catch {
						// skip malformed
					}
				}
			}
		} catch (e) {
			const idx = this.messages.findIndex((m) => m.id === assistantId);
			if (idx !== -1) {
				this.messages[idx] = {
					...this.messages[idx],
					events: [{ type: 'error', content: e instanceof Error ? e.message : String(e) }]
				};
			}
		} finally {
			const idx = this.messages.findIndex((m) => m.id === assistantId);
			if (idx !== -1) {
				this.messages[idx] = { ...this.messages[idx], streaming: false };
			}
			this.loading = false;
			this.saveToStorage();
		}
	}
}

export const chatStore = new ChatStore();
