// 2026-06-08 Bauteil 2.7c: Geteilte Types fuer Hauskauf-Karten +
// Loader. MailLink war urspruenglich in (mail)/kampagne/+page.server.ts
// (entfernt in 2.7b), HauskaufCard war loader-internal — beides hier
// zusammengezogen weil HauskaufCard.svelte + loader.ts es brauchen.

import type { HauskaufWorkflowRow } from '$lib/server/folio-db/types.js';
import type { CouncilObjectRow } from '$lib/server/council-db/types.js';

export interface MailLink {
	feedback_id: number;
	subject: string;
	sender: string;
	account_id: string | null;
	mail_date: string | null;
}

export interface HauskaufCard {
	workflow: HauskaufWorkflowRow;
	object: CouncilObjectRow | null;
	mailLinks: MailLink[];
}
