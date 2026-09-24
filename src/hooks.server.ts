import { building } from '$app/environment';
import { startIntakeRuntime } from '$lib/server/mail-intake/runner.js';
import { isLedgerDemo, ledgerDemoRoot, ledgerDemoRequestAllowed, validateLedgerDemoTree } from '$lib/server/ledger-demo.js';
if (!building) {
 if (isLedgerDemo()) validateLedgerDemoTree();
 else startIntakeRuntime();
}
// Direktive 6 (council-iteration-1.5): Auth-Layer via Tailscale-Header.
//
// Tailscale Serve setzt und bereinigt `Tailscale-User-Login` +
// `Tailscale-User-Name` als Request-Header. Folio muss dabei selbst nur auf
// Loopback lauschen; Serve ist der einzige Netz-Eingang. Für den direkten
// Localhost-Zugriff (kein Tailscale-Proxy
// dazwischen) fallen wir auf den Default-User (id=1, role=owner) zurück.
//
// Unbekannte Tailscale-Logins werden auto-angelegt mit role=council_member.
// Owner-Promotion über direkten DB-Edit oder späteres Admin-UI.

import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import {
	getUserByTailscaleLogin,
	getDefaultLocalUser,
	upsertUserFromTailscale
} from '$lib/server/folio-db/reader.js';

export const handle: Handle = async ({ event, resolve }) => {
	if (isLedgerDemo()) {
		ledgerDemoRoot(); // Invalid configuration must fail closed before any owner/database lookup.
		if (!ledgerDemoRequestAllowed(event.request.method, event.url.pathname, event.url.hostname, event.request.headers.get('host') ?? '')) {
			throw error(403, 'Diese Vorführung erlaubt nur das Lesen der synthetischen Ledger-Beispiele.');
		}
		if (event.url.pathname === '/') return new Response(null, { status: 303, headers: { location: '/demo/ledger' } });
		event.locals.user = { id: 1, tailscale_login: null, display_name: 'Demo', role: 'owner', created_at: '2026-01-01T00:00:00Z' };
		const response = await resolve(event);
		response.headers.set('cache-control', 'no-store');
		response.headers.set('x-robots-tag', 'noindex, nofollow');
		return response;
	}
	const tsLogin = event.request.headers.get('tailscale-user-login');
	const tsName = event.request.headers.get('tailscale-user-name');
	const localHostnames = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

	if (tsLogin) {
		const existing = getUserByTailscaleLogin(tsLogin);
		event.locals.user = existing ?? upsertUserFromTailscale(tsLogin, tsName ?? tsLogin);
	} else if (localHostnames.has(event.url.hostname)) {
		event.locals.user = getDefaultLocalUser();
	} else {
		// Tailscale Serve adds and sanitizes identity headers. A non-loopback
		// request without one must never inherit the local owner's identity (for
		// example traffic from a tagged device or an accidentally exposed bind).
		throw error(403, 'Tailscale identity required');
	}

	return resolve(event);
};
