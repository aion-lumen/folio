// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { UserRow } from '$lib/server/folio-db/types.js';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: UserRow;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
