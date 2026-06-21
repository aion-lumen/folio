// 2026-06-08 Bauteil 2.7b: Wiederverwendbarer Loader-Helper fuer
// Hauskauf-Workflow-Karten. Ursprung: (mail)/kampagne/+page.server.ts
// aus 2.7 (wird mit 2.7b geloescht). Jetzt vom Vault-Loader benutzt
// um die Hauskauf-Sub-Sicht im 04-hauskauf-Kapitel zu fuellen.
//
// Pfad pro Karte:
//   1. listAllHauskaufWorkflow() — append-only latest-wins per
//      council_object_id (folio.db)
//   2. pro Workflow: getCouncilObjectById() — cross-DB read-only fuer
//      Adresse + Portal + Preis (council.db)
//   3. from_feedback_ids aus Object parsen (JSON-Array)
//   4. getFeedbackBriefsByIds() batch-lookup ueber alle einzigartigen
//      feedback_ids fuer Mail-Bruecken (subject + sender)
//   5. Resultat-Shape: HauskaufCard[]

import { listAllHauskaufWorkflow } from '$lib/server/folio-db/reader.js';
import { insertHauskaufWorkflow } from '$lib/server/folio-db/writer.js';
import {
	getCouncilObjectById,
	getConsensusReadyObjectIds
} from '$lib/server/council-db/reader.js';
import {
	getFeedbackBriefsByIds,
	type FeedbackBrief
} from '$lib/server/feedback/reader.js';
import type { HauskaufCard, MailLink } from '$lib/kampagne/types.js';

// 2026-06-08 Bauteil 2.7c (D8): Auto-Eintritt bei Council-Konsens.
// Reuse von getConsensusReadyObjectIds() (council-db/reader.ts:787) —
// liefert object_ids wo beide User in user_rankings einen Top-3-Rang
// haben UND noch kein hauskauf_workflow existiert (Pre-Filter im
// Reader macht es idempotent). Pro ID legt diese Funktion einen
// initialen Eintrag mit status='offen' an. Default-user (id=1) als
// created_by_user_id — system-getriebene Aktion, owner als
// implicit-actor.
//
// Cross-DB-Constraint (Memory: ACK statt Cross-DB-Write): folio-seitig
// triggert, council-worker schreibt nicht in folio.db. ✓
function ensureHauskaufWorkflowsForConsensus(): void {
	const readyIds = getConsensusReadyObjectIds();
	for (const objectId of readyIds) {
		insertHauskaufWorkflow({
			council_object_id: objectId,
			status: 'offen',
			created_by_user_id: 1
		});
	}
}

export function loadHauskaufWorkflowCards(): HauskaufCard[] {
	// Auto-Eintritt vor Read: neue Konsens-Objekte werden als
	// hauskauf_workflow status='offen' angelegt, falls noch nicht da.
	ensureHauskaufWorkflowsForConsensus();

	const workflows = listAllHauskaufWorkflow();

	const enriched = workflows.map((w) => {
		const object = getCouncilObjectById(w.council_object_id);
		let feedbackIds: number[] = [];
		if (object?.from_feedback_ids) {
			try {
				const parsed = JSON.parse(object.from_feedback_ids);
				if (Array.isArray(parsed)) {
					feedbackIds = parsed.filter((x): x is number => typeof x === 'number');
				}
			} catch {
				feedbackIds = [];
			}
		}
		return { workflow: w, object, feedbackIds };
	});

	const allIds = Array.from(new Set(enriched.flatMap((e) => e.feedbackIds)));
	const briefsMap = getFeedbackBriefsByIds(allIds);

	return enriched.map((e) => {
		const mailLinks: MailLink[] = e.feedbackIds
			.map((id) => briefsMap.get(id))
			.filter((b): b is FeedbackBrief => b != null)
			.map((b) => ({
				feedback_id: b.id,
				subject: b.subject,
				sender: b.sender,
				account_id: b.account_id,
				mail_date: b.mail_date
			}));
		return {
			workflow: e.workflow,
			object: e.object,
			mailLinks
		};
	});
}
