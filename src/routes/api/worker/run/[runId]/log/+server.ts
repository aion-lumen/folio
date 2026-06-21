// F.7 — SSE /api/worker/run/[runId]/log
// Streams log-lines (stdout + stderr) for an active worker-run. Replays buffer + lives.
// Pattern: existing /api/mail/watch SSE-Skeleton.

import { error } from '@sveltejs/kit';
import { subscribeToLogs, getLogSnapshot, getActiveRun } from '$lib/server/worker-runner/manager.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = ({ params, request }) => {
	const uuid = params.runId;
	if (!uuid) throw error(400, 'runId required');
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

			const active = getActiveRun();
			if (!active || active.uuid !== uuid) {
				// Non-active run: send historical buffer (empty after process exit) + close
				const snapshot = getLogSnapshot(uuid);
				for (const line of snapshot) send(line);
				send({ event: 'end', reason: 'run-not-active' });
				try {
					controller.close();
				} catch {
					/* already closed */
				}
				return;
			}

			const { unsubscribe, replay } = subscribeToLogs(uuid, (line) => send(line));
			for (const line of replay) send(line);

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
