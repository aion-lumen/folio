// 2026-06-08 Bauteil 2.7c: Vault-Page-Loader.
// Ergänzt die LIFE-Kampagne-Daten (campaign/acts/chapters via
// +layout.server.ts) um die Hauskauf-Workflow-Karten. Wird in der
// Page nur im 04-hauskauf-Kapitel als HauskaufKanban gerendert
// (entweder/oder mit dem LIFE-KanbanBoard).
//
// loader macht auch auto-eintritt bei council-konsens (siehe
// ensureHauskaufWorkflowsForConsensus in loader.ts).
//
// Klein (n Workflows unter ~20 pro User), kein lazy-load nötig.

import { loadHauskaufWorkflowCards } from '$lib/server/kampagne/loader.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
	return {
		hauskaufCards: loadHauskaufWorkflowCards()
	};
};
