// F.3 — feedback.db file-watcher. chokidar watches the .db + .db-wal files.
// 500ms-debounce per Worker-Burst-Protection. SSE-broadcast via singleton.

import chokidar from 'chokidar';
import { getFeedbackDbPath } from '../env.js';

export type FeedbackChangeEvent = {
	type: 'change' | 'add';
	path: string;
};

type Listener = (event: FeedbackChangeEvent) => void;

class FeedbackWatcher {
	private watcher: ReturnType<typeof chokidar.watch> | null = null;
	private listeners = new Set<Listener>();
	private debounceMap = new Map<string, ReturnType<typeof setTimeout>>();

	start(): void {
		if (this.watcher) return;
		const dbPath = getFeedbackDbPath();
		this.watcher = chokidar.watch([dbPath, `${dbPath}-wal`], {
			ignoreInitial: true,
			persistent: true
		});

		const emit = (type: FeedbackChangeEvent['type']) => (filePath: string) => {
			const existing = this.debounceMap.get(filePath);
			if (existing) clearTimeout(existing);
			this.debounceMap.set(
				filePath,
				setTimeout(() => {
					this.debounceMap.delete(filePath);
					this.listeners.forEach((l) => l({ type, path: filePath }));
				}, 500)
			);
		};

		this.watcher.on('change', emit('change'));
		this.watcher.on('add', emit('add'));
	}

	stop(): void {
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		this.start();
		return () => this.listeners.delete(listener);
	}
}

export const feedbackWatcher = new FeedbackWatcher();
