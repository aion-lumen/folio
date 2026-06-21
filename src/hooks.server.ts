// Direktive 6 (council-iteration-1.5): Auth-Layer via Tailscale-Header.
//
// Tailscale-Funnel/Proxy setzt `Tailscale-User-Login` + `Tailscale-User-Name`
// als Request-Header. Für Localhost-Direktzugriff (kein Tailscale-Proxy
// dazwischen) fallen wir auf den Default-User (id=1, role=owner) zurück.
//
// Unbekannte Tailscale-Logins werden auto-angelegt mit role=council_member.
// Owner-Promotion über direkten DB-Edit oder späteres Admin-UI.

import type { Handle } from '@sveltejs/kit';
import {
	getUserByTailscaleLogin,
	getDefaultLocalUser,
	upsertUserFromTailscale
} from '$lib/server/folio-db/reader.js';

export const handle: Handle = async ({ event, resolve }) => {
	const tsLogin = event.request.headers.get('tailscale-user-login');
	const tsName = event.request.headers.get('tailscale-user-name');

	if (tsLogin) {
		const existing = getUserByTailscaleLogin(tsLogin);
		event.locals.user = existing ?? upsertUserFromTailscale(tsLogin, tsName ?? tsLogin);
	} else {
		event.locals.user = getDefaultLocalUser();
	}

	return resolve(event);
};
