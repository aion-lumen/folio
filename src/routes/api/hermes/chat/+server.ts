import { error } from '@sveltejs/kit';
import { sendMessage } from '$lib/server/hermes/client.js';
import type { ChatContext, HistoryMessage } from '$lib/server/hermes/client.js';
import type { RequestHandler } from './$types.js';

// Single-user, local app: only one chat request may be in flight at a time.
// A 2nd concurrent POST (a race / double-send) is rejected cleanly instead of
// opening a parallel agent stream to the gateway — overlapping streams were
// what drove the model-reload / token-burn loop.
let chatInFlight = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECTIVE_ID_RE = /^obj-\d+[a-z]?-\d+$/;

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { message, context, history, selectedObjectiveIds, sessionId, turnId } = body as {
		message: string;
		context: ChatContext;
		history?: HistoryMessage[];
		selectedObjectiveIds?: string[];
		sessionId?: string;
		turnId?: string;
	};

	if (typeof message !== 'string' || !message.trim()) throw error(400, 'message required');
	if (!sessionId || !UUID_RE.test(sessionId)) throw error(400, 'valid sessionId required');
	if (!turnId || !UUID_RE.test(turnId)) throw error(400, 'valid turnId required');
	if (
		!Array.isArray(selectedObjectiveIds ?? []) ||
		(selectedObjectiveIds ?? []).some((id) => typeof id !== 'string' || !OBJECTIVE_ID_RE.test(id))
	) {
		throw error(400, 'invalid selectedObjectiveIds');
	}

	if (chatInFlight) {
		throw error(409, 'A chat request is already in progress. Wait for it to finish.');
	}
	chatInFlight = true;

	const encoder = new TextEncoder();
	// Aborts the gateway stream if the browser disconnects mid-response.
	const ac = new AbortController();

	const stream = new ReadableStream({
		async start(controller) {
			const enqueue = (obj: unknown) =>
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

			try {
				// sendMessage streams events as they arrive — enqueue each immediately
				// so the UI renders progressively instead of waiting for the full turn.
				for await (const event of sendMessage(
					message,
					context ?? { view: 'unknown' },
					history ?? [],
					selectedObjectiveIds ?? [],
					{ sessionId, turnId },
					ac.signal
				)) {
					enqueue(event);
				}
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				enqueue({ type: 'error', content: msg });
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
			} finally {
				controller.close();
				chatInFlight = false;
			}
		},
		// Client disconnected before the stream finished — abort the gateway stream
		// and release the guard so the next message isn't blocked.
		cancel() {
			ac.abort();
			chatInFlight = false;
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
