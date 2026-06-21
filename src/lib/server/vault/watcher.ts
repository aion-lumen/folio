import chokidar from 'chokidar';
import { join } from 'path';
import { getVaultPath } from '../env.js';

type WatchEvent = {
	type: 'change' | 'add' | 'unlink';
	path: string;
};

type Listener = (event: WatchEvent) => void;

class VaultWatcher {
	private watcher: ReturnType<typeof chokidar.watch> | null = null;
	private listeners = new Set<Listener>();
	private debounceMap = new Map<string, ReturnType<typeof setTimeout>>();

	start() {
		if (this.watcher) return;
		const watchPath = join(getVaultPath(), '_campaign', '**', '*.md');
		this.watcher = chokidar.watch(watchPath, {
			ignoreInitial: true,
			persistent: true
		});

		const emit = (type: WatchEvent['type']) => (filePath: string) => {
			const existing = this.debounceMap.get(filePath);
			if (existing) clearTimeout(existing);
			this.debounceMap.set(
				filePath,
				setTimeout(() => {
					this.debounceMap.delete(filePath);
					this.listeners.forEach((l) => l({ type, path: filePath }));
				}, 200)
			);
		};

		this.watcher.on('change', emit('change'));
		this.watcher.on('add', emit('add'));
		this.watcher.on('unlink', emit('unlink'));
	}

	stop() {
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		if (this.listeners.size === 1) this.start();
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) this.stop();
		};
	}
}

export const vaultWatcher = new VaultWatcher();
