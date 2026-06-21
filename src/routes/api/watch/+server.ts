import { vaultWatcher } from '$lib/server/vault/watcher.js';
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

			const unsubscribe = vaultWatcher.subscribe((event) => {
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
					// already closed
				}
			});
		},
		cancel() {
			closed = true;
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
