// F.3 — SSE /api/mail/watch
// Streams `data: {"type":"change","path":"..."}` events when feedback.db (or -wal) changes.
// Pattern mirrors src/routes/api/watch/+server.ts (vault file-watch).
// 30s ping for keep-alive.

import { feedbackWatcher } from '$lib/server/feedback/watcher.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = ({ request }) => {
	const encoder = new TextEncoder();
	let closed = false;

	const stream = new ReadableStream({
		start(controller) {
			const send = (data: object) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					closed = true;
				}
			};

			const unsubscribe = feedbackWatcher.subscribe((event) => {
				send(event);
			});

			const ping = setInterval(() => {
				if (closed) {
					clearInterval(ping);
					return;
				}
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					closed = true;
					clearInterval(ping);
				}
			}, 30000);

			request.signal.addEventListener('abort', () => {
				if (closed) return;
				closed = true;
				unsubscribe();
				clearInterval(ping);
				try {
					controller.close();
				} catch {
					/* already closed */
				}
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
