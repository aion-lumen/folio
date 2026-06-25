import { error } from '@sveltejs/kit';
import { sendMessage } from '$lib/server/hermes/client.js';
import type { ChatContext, HistoryMessage } from '$lib/server/hermes/client.js';
import type { RequestHandler } from './$types.js';

// Single-user, local app: only one chat request may be in flight at a time.
// A 2nd concurrent POST (a race / double-send) is rejected cleanly instead of
// opening a parallel agent stream to the gateway — overlapping streams were
// what drove the model-reload / token-burn loop.
let chatInFlight = false;

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { message, context, history, selectedObjectiveIds } = body as {
		message: string;
		context: ChatContext;
		history?: HistoryMessage[];
		selectedObjectiveIds?: string[];
	};

	if (!message) throw error(400, 'message required');

	if (chatInFlight) {
		throw error(409, 'A chat request is already in progress. Wait for it to finish.');
	}
	chatInFlight = true;

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const enqueue = (obj: unknown) =>
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

			try {
				const events = await sendMessage(
					message,
					context ?? { view: 'unknown' },
					history ?? [],
					selectedObjectiveIds ?? []
				);
				for (const event of events) {
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
		// Client disconnected before the stream finished — release the guard so
		// the next message isn't blocked by a stuck in-flight flag.
		cancel() {
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
