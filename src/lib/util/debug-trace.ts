// F.8 BUG-J Diagnose-Hilfe.
//
// Browser-Console-Traces für die Auto-Trigger-Cascade. Aktivierung:
//   localStorage.setItem('folio-debug', '1')
//   window.location.reload()
// Deaktivierung:
//   localStorage.removeItem('folio-debug')
//
// Alle Logs sind mit `[F.8-J <topic>]` prefixed für grep/filter im Browser-Konsole.
// Reihenfolge der Events ist diagnostisch:
//   1. SSE-event (worker/validator/mail-watch)
//   2. invalidateAll-Aufrufe (mit Source)
//   3. mailDetailStore.open/close (mit Stack)
//   4. activeRun-Übergänge
//   5. toast.show

import { browser } from '$app/environment';

let _enabled: boolean | null = null;
function enabled(): boolean {
	if (_enabled !== null) return _enabled;
	if (!browser) return false;
	try {
		_enabled = window.localStorage.getItem('folio-debug') === '1';
	} catch {
		_enabled = false;
	}
	return _enabled;
}

export function tlog(topic: string, ...args: unknown[]): void {
	if (!enabled()) return;
	const ts = new Date().toISOString().slice(11, 23);
	// eslint-disable-next-line no-console
	console.log(`[F.8-J ${topic}] ${ts}`, ...args);
}

export function ttrace(topic: string, ...args: unknown[]): void {
	if (!enabled()) return;
	const ts = new Date().toISOString().slice(11, 23);
	// eslint-disable-next-line no-console
	console.log(`[F.8-J ${topic}] ${ts}`, ...args);
	// eslint-disable-next-line no-console
	console.trace(`[F.8-J ${topic}] stack`);
}
