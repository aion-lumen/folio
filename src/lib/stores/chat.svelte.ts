import type { ExecutionProfile } from '$lib/types/execution-profile.js';

export interface ChatEvent {
	type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'system_notice' | 'execution_profile';
	content?: string;
	name?: string;
	args?: Record<string, unknown>;
	output?: string;
	profile?: ExecutionProfile;
}

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant';
	events: ChatEvent[];
	sessionId?: string;
	turnId?: string;
	objectiveIds?: string[];
	executionProfile?: ExecutionProfile;
	streaming?: boolean;
}

const STORAGE_KEY = 'folio-chat';
const SESSION_KEY = 'folio-chat-session';
const MAX_MESSAGES = 100;

function loadOrCreateSessionId(): string {
	if (typeof window === 'undefined') return '';
	try {
		const stored = localStorage.getItem(SESSION_KEY);
		if (stored) return stored;
		const created = crypto.randomUUID();
		localStorage.setItem(SESSION_KEY, created);
		return created;
	} catch {
		return crypto.randomUUID();
	}
}

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
	sessionId = $state('');
	context = $state({ view: 'strategic', selectedItem: '', currentChapter: 1 });

	constructor() {
		if (typeof window !== 'undefined') {
			this.messages = loadFromStorage();
			this.sessionId = loadOrCreateSessionId();
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

	/** Start a fresh Folio-owned session. Its new opaque ID derives a distinct
	 * Hermes conversation, so no shared gateway pointer needs to be mutated. */
	async newChat() {
		try {
			this.sessionId = crypto.randomUUID();
			localStorage.setItem(SESSION_KEY, this.sessionId);
		} catch {
			this.sessionId = crypto.randomUUID();
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
		if (!this.sessionId) this.sessionId = loadOrCreateSessionId();
		const turnId = crypto.randomUUID();

		this.messages.push({
			id: crypto.randomUUID(),
			role: 'user',
			events: [{ type: 'text', content: message }],
			sessionId: this.sessionId,
			turnId,
			objectiveIds: [...selectedObjectiveIds]
		});
		this.loading = true;

		const assistantId = crypto.randomUUID();
		this.messages.push({
			id: assistantId,
			role: 'assistant',
			events: [],
			sessionId: this.sessionId,
			turnId,
			objectiveIds: [...selectedObjectiveIds],
			streaming: true
		});

		try {
			const res = await fetch('/api/hermes/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message,
					context: this.context,
					history,
					selectedObjectiveIds,
					sessionId: this.sessionId,
					turnId
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
							if (event.type === 'execution_profile' && event.profile) {
								this.messages[idx] = {
									...this.messages[idx],
									executionProfile: event.profile
								};
								continue;
							}
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
