import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { isDemoVaultActive } from '$lib/server/env.js';
import { compileMemoryContext } from '$lib/server/memory/compiler.js';
import {
	confirmMemoryFactByHuman,
	findMemoryFactBySource,
	proposeMemoryFact
} from '$lib/server/memory/store.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import {
	answerRelayContext,
	applyRelayResponse,
	archiveInvalidRelayResponse,
	approveRelayEgress,
	getRelayInboxPath,
	getRelayPayloadForReview,
	getRelayResponseDropPath,
	getRelayResponseForReview,
	ingestAvailableRelayResponses,
	ingestRelayResponse,
	listRelayCases,
	rejectRelayResponse,
	shareRelayCase,
	stageRelayCase
} from '$lib/server/relay/store.js';
import {
	createDefaultCareerFilesystemTarget,
	DEMO_CAREER_TARGET,
	loadSessionTargets
} from '$lib/server/relay/targets.js';
import type { RelayResponseResult } from '$lib/server/relay/types.js';
import { createObjective } from '$lib/server/vault/writer.js';
import type { Actions, PageServerLoad } from './$types.js';

function homeRelative(path: string): string {
	const home = homedir();
	return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

function ensureDemoCase(): void {
	if (!isDemoVaultActive()) return;
	const sourceRef = 'demo:career-interview-context-v3';
	if (listRelayCases().some((item) => item.source_ref === sourceRef)) return;
	let availability = findMemoryFactBySource('career', 'demo:career-availability');
	if (!availability) {
		availability = proposeMemoryFact({
			domain: 'career',
			data_class: 'availability',
			sensitivity: 'private',
			subject: 'Alex',
			predicate: 'available_for_interview',
			value: 'Tuesday at 10:00',
			source_kind: 'owner',
			source_ref: 'demo:career-availability',
			actor_kind: 'human',
			actor_id: 'demo-owner'
		});
		availability = confirmMemoryFactByHuman(availability.fact_id, 'demo-owner');
	}
	const subject = 'Einladung zum zweiten Gespräch';
	const body = `Guten Tag Alex\n\nwir möchten Sie gerne zu einem zweiten Gespräch einladen. Wären Dienstag um 10:00 Uhr oder Mittwoch um 14:00 Uhr für Sie möglich?\n\nFreundliche Grüsse\nMara Keller`;
	const memoryContext = compileMemoryContext({
		domain: 'career',
		query: `${subject}\n${body}`,
		max_sensitivity: DEMO_CAREER_TARGET.memory_max_sensitivity ?? 'public'
	});
	stageRelayCase({
		domain: 'career',
		source_kind: 'mail',
		source_ref: sourceRef,
		subject,
		body,
		capability: 'reply_draft',
		data_classes: ['mail_metadata', 'mail_body', 'memory_context'],
		memory_context: memoryContext,
		target: DEMO_CAREER_TARGET
	});
}

function writeDemoRelayResponse(
	caseId: string,
	domain: string,
	requestHash: string,
	result: RelayResponseResult
): void {
	const path = getRelayResponseDropPath(caseId, domain);
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const temp = `${path}.${randomUUID()}.tmp`;
	writeFileSync(temp, JSON.stringify({
		schema: 'folio/session-relay-response/v1',
		case_id: caseId,
		request_hash: requestHash,
		target_id: DEMO_CAREER_TARGET.id,
		result,
		created_at: new Date().toISOString()
	}), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
	renameSync(temp, path);
	ingestRelayResponse(caseId, DEMO_CAREER_TARGET);
}

export const load: PageServerLoad = async () => {
	requireModuleCapability('relay', 'panel.render');
	requireModuleCapability('relay', 'cases.read');
	requireModuleCapability('relay', 'responses.read');
	ensureDemoCase();
	const targets = loadSessionTargets();
	const filesystemTarget = targets.find((target) => target.adapter === 'filesystem' || target.adapter === 'cowork-filesystem');
	const responseErrors = ingestAvailableRelayResponses(targets);
	const responseErrorByCase = new Map(responseErrors.map((item) => [item.case_id, item.error]));
	const labels = Object.fromEntries(targets.map((target) => [target.id, target.label]));
	const cases = listRelayCases().map((item) => {
		const payload = getRelayPayloadForReview(item.case_id);
		return {
			...item,
			target_label: labels[item.target_id] ?? item.target_id,
			preview: payload.body,
			follow_ups: payload.follow_ups ?? [],
			memory_context: payload.memory_context ?? null,
			response_error: responseErrorByCase.get(item.case_id) ?? null,
			response: (() => {
				if (!['answered', 'needs_context', 'applied', 'rejected'].includes(item.status)) return null;
				const target = targets.find((candidate) => candidate.id === item.target_id);
				if (!target) return null;
				try {
					return getRelayResponseForReview(item.case_id, target).result;
				} catch {
					return null;
				}
			})()
		};
	});
	return {
		cases,
		targetsConfigured: targets.length > 0,
		targets: targets.map((target) => ({
			id: target.id,
			label: target.label,
			domain: target.domain,
			locality: target.locality,
			adapter: target.adapter
		})),
		filesystemInboxPath: filesystemTarget ? homeRelative(getRelayInboxPath(filesystemTarget.domain)) : null,
		responseErrors,
		demo: isDemoVaultActive()
	};
};

export const actions: Actions = {
	configureCareer: async () => {
		requireModuleCapability('relay', 'targets.configure');
		if (isDemoVaultActive()) return fail(409, { message: 'Das Demo-Ziel ist bereits isoliert eingerichtet.' });
		try {
			if (loadSessionTargets().length) return fail(409, { message: 'Es ist bereits ein Session-Ziel eingerichtet.' });
			createDefaultCareerFilesystemTarget();
			return { success: true, configured: true };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Ziel konnte nicht eingerichtet werden.' });
		}
	},
	share: async ({ request }) => {
		requireModuleCapability('relay', 'cases.read');
		requireModuleCapability('relay', 'egress.approve');
		requireModuleCapability('relay', 'cases.share');
		const data = await request.formData();
		const caseId = String(data.get('case_id') ?? '');
		try {
			const relayCase = listRelayCases().find((item) => item.case_id === caseId);
			if (!relayCase) return fail(404, { message: 'Übergabe nicht gefunden.' });
			const target = loadSessionTargets().find((item) => item.id === relayCase.target_id);
			if (!target) return fail(409, { message: 'Ziel ist nicht mehr konfiguriert.' });
			if (target.locality === 'cloud') approveRelayEgress(caseId, 'owner');
			shareRelayCase(caseId, target);
			return { success: true, caseId };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Freigabe fehlgeschlagen.' });
		}
	},
	demoResponse: async ({ request }) => {
		requireModuleCapability('relay', 'cases.read');
		requireModuleCapability('relay', 'responses.read');
		if (!isDemoVaultActive()) return fail(404, { message: 'Nur im Demo-Vault verfügbar.' });
		const data = await request.formData();
		const caseId = String(data.get('case_id') ?? '');
		try {
			const relayCase = listRelayCases().find((item) => item.case_id === caseId);
			if (!relayCase) return fail(404, { message: 'Übergabe nicht gefunden.' });
			if (relayCase.status !== 'shared') return fail(409, { message: 'Die Demo-Session wartet noch nicht auf diesen Fall.' });
			writeDemoRelayResponse(caseId, relayCase.domain, relayCase.request_hash, {
				kind: 'reply_draft',
				subject: `Re: ${relayCase.subject}`,
				body: 'Guten Tag Frau Keller\n\nvielen Dank für die Einladung. Dienstag um 10:00 Uhr passt mir sehr gut. Ich freue mich auf das zweite Gespräch.\n\nFreundliche Grüsse\nAlex'
			});
			return { success: true, caseId, demoResponse: true };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Demo-Antwort fehlgeschlagen.' });
		}
	},
	demoContextQuestion: async ({ request }) => {
		requireModuleCapability('relay', 'cases.read');
		requireModuleCapability('relay', 'responses.read');
		if (!isDemoVaultActive()) return fail(404, { message: 'Nur im Demo-Vault verfügbar.' });
		const data = await request.formData();
		const caseId = String(data.get('case_id') ?? '');
		try {
			const relayCase = listRelayCases().find((item) => item.case_id === caseId);
			if (!relayCase) return fail(404, { message: 'Übergabe nicht gefunden.' });
			if (relayCase.status !== 'shared') return fail(409, { message: 'Die Demo-Session wartet noch nicht auf diesen Fall.' });
			writeDemoRelayResponse(caseId, relayCase.domain, relayCase.request_hash, {
				kind: 'needs_context',
				question: 'Soll ich Dienstag um 10:00 Uhr verbindlich zusagen?'
			});
			return { success: true, caseId, demoContextQuestion: true };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Demo-Rückfrage fehlgeschlagen.' });
		}
	},
	demoNoAction: async ({ request }) => {
		requireModuleCapability('relay', 'cases.read');
		requireModuleCapability('relay', 'responses.read');
		if (!isDemoVaultActive()) return fail(404, { message: 'Nur im Demo-Vault verfügbar.' });
		const data = await request.formData();
		const caseId = String(data.get('case_id') ?? '');
		try {
			const relayCase = listRelayCases().find((item) => item.case_id === caseId);
			if (!relayCase) return fail(404, { message: 'Übergabe nicht gefunden.' });
			if (relayCase.status !== 'shared') return fail(409, { message: 'Die Demo-Session wartet noch nicht auf diesen Fall.' });
			writeDemoRelayResponse(caseId, relayCase.domain, relayCase.request_hash, {
				kind: 'no_action_needed',
				reason: 'Diese Nachricht ist rein informativ und erwartet keine Antwort.'
			});
			return { success: true, caseId, demoNoAction: true };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Demo-Empfehlung fehlgeschlagen.' });
		}
	},
	answerContext: async ({ request }) => {
		requireModuleCapability('relay', 'cases.read');
		requireModuleCapability('relay', 'cases.stage');
		requireModuleCapability('relay', 'responses.read');
		const data = await request.formData();
		const caseId = String(data.get('case_id') ?? '');
		const answer = String(data.get('answer') ?? '');
		try {
			const relayCase = listRelayCases().find((item) => item.case_id === caseId);
			if (!relayCase) return fail(404, { message: 'Übergabe nicht gefunden.' });
			const target = loadSessionTargets().find((item) => item.id === relayCase.target_id);
			if (!target) return fail(409, { message: 'Ziel ist nicht mehr konfiguriert.' });
			answerRelayContext(caseId, answer, 'owner', target);
			return { success: true, caseId, contextAnswered: true };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Antwort konnte nicht ergänzt werden.' });
		}
	},
	apply: async ({ request }) => {
		requireModuleCapability('relay', 'cases.read');
		requireModuleCapability('relay', 'responses.read');
		requireModuleCapability('relay', 'responses.apply');
		const data = await request.formData();
		const caseId = String(data.get('case_id') ?? '');
		try {
			const relayCase = listRelayCases().find((item) => item.case_id === caseId);
			if (!relayCase) return fail(404, { message: 'Übergabe nicht gefunden.' });
			const target = loadSessionTargets().find((item) => item.id === relayCase.target_id);
			if (!target) return fail(409, { message: 'Ziel ist nicht mehr konfiguriert.' });
			const response = getRelayResponseForReview(caseId, target);
			let targetRef: string | undefined;
			if (response.result.kind === 'objective_proposal') {
				if (!response.result.chapter_slug) return fail(409, { message: 'Der Objective-Vorschlag nennt kein Kapitel.' });
				const objectiveId = await createObjective(response.result.chapter_slug, {
					title: response.result.title,
					threshold: response.result.threshold,
					weight: 1,
					related_goals: [],
					deadline: response.result.deadline,
					historyNote: `created from relay case ${caseId}`
				});
				targetRef = `objective:${objectiveId}`;
			}
			applyRelayResponse(caseId, 'owner', target, targetRef);
			return { success: true, caseId, applied: true };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Übernahme fehlgeschlagen.' });
		}
	},
	reject: async ({ request }) => {
		requireModuleCapability('relay', 'responses.apply');
		const data = await request.formData();
		const caseId = String(data.get('case_id') ?? '');
		try {
			rejectRelayResponse(caseId, 'owner');
			return { success: true, caseId, rejected: true };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Verwerfen fehlgeschlagen.' });
		}
	},
	discardInvalid: async ({ request }) => {
		requireModuleCapability('relay', 'cases.read');
		requireModuleCapability('relay', 'responses.read');
		requireModuleCapability('relay', 'responses.apply');
		const data = await request.formData();
		const caseId = String(data.get('case_id') ?? '');
		try {
			const relayCase = listRelayCases().find((item) => item.case_id === caseId);
			if (!relayCase) return fail(404, { message: 'Übergabe nicht gefunden.' });
			const target = loadSessionTargets().find((item) => item.id === relayCase.target_id);
			if (!target) return fail(409, { message: 'Ziel ist nicht mehr konfiguriert.' });
			archiveInvalidRelayResponse(caseId, 'owner', target);
			return { success: true, caseId, invalidDiscarded: true };
		} catch (error) {
			return fail(409, { message: error instanceof Error ? error.message : 'Ungültige Antwort konnte nicht verworfen werden.' });
		}
	}
};
