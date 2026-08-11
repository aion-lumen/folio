import { compileMemoryContext } from '../memory/compiler.js';
import { enforceRelayRetention, findRelayCaseBySource, stageRelayCase } from './store.js';
import type { RelayCaseView, SessionTarget } from './types.js';

export class MailRelayError extends Error {}

export interface CareerMailRelayInput {
	feedback_id: number;
	account_id: string;
	imap_uid: number;
	sender: string;
	to_addr?: string | null;
	subject: string;
	received_at?: string | null;
	domain: string | null;
	body: string | null;
	body_truncated: boolean;
	target_id?: string;
}

export interface CareerMailRelayResult {
	case: RelayCaseView;
	target: SessionTarget;
	created: boolean;
	body_truncated: boolean;
}

export function mailRelaySourceRef(accountId: string, imapUid: number): string {
	const account = accountId.trim();
	if (!account || !Number.isInteger(imapUid) || imapUid < 1) {
		throw new MailRelayError('mail source identity is invalid');
	}
	return `mail:${account}:${imapUid}`;
}

export function isCareerMailDomain(domain: string | null | undefined): boolean {
	return domain === 'job' || domain === 'job-lead';
}

function chooseTarget(targets: SessionTarget[], requestedId?: string): SessionTarget {
	const eligible = targets.filter((target) =>
		target.domain === 'career' &&
		target.capabilities.includes('reply_draft') &&
		target.allowed_data_classes.includes('mail_metadata') &&
		target.allowed_data_classes.includes('mail_body')
	);
	const target = requestedId
		? eligible.find((candidate) => candidate.id === requestedId)
		: eligible[0];
	if (!target) throw new MailRelayError('Kein passendes Karriere-Session-Ziel eingerichtet.');
	return target;
}

function reviewedMailBody(input: CareerMailRelayInput): string {
	const body = input.body?.trim();
	if (!body) throw new MailRelayError('Für diese Mail ist kein lokaler Inhaltsauszug verfügbar.');
	const metadata = [
		`Von: ${input.sender}`,
		...(input.to_addr ? [`An: ${input.to_addr}`] : []),
		...(input.received_at ? [`Datum: ${input.received_at}`] : []),
		`Betreff: ${input.subject}`
	];
	const truncation = input.body_truncated
		? '\n\n[Hinweis von Folio: Der Worker hat nur einen lokalen Inhaltsauszug gespeichert; dessen Vollständigkeit ist nicht belegt.]'
		: '';
	return `${metadata.join('\n')}\n\n${body}${truncation}`;
}

export function stageCareerMailRelay(
	input: CareerMailRelayInput,
	targets: SessionTarget[]
): CareerMailRelayResult {
	if (!Number.isInteger(input.feedback_id) || input.feedback_id < 1) {
		throw new MailRelayError('feedback_id is invalid');
	}
	if (!isCareerMailDomain(input.domain)) {
		throw new MailRelayError('Nur als Job oder Job-Lead bestätigte Mails können an die Karriere-Session gehen.');
	}
	const target = chooseTarget(targets, input.target_id);
	enforceRelayRetention();
	const sourceRef = mailRelaySourceRef(input.account_id, input.imap_uid);
	const existing = findRelayCaseBySource('mail', sourceRef, target.id);
	if (existing) return { case: existing, target, created: false, body_truncated: input.body_truncated };

	const body = reviewedMailBody(input);
	const dataClasses = ['mail_metadata', 'mail_body'];
	const memoryContext = target.allowed_data_classes.includes('memory_context') && target.memory_max_sensitivity
		? compileMemoryContext({
			domain: 'career',
			query: `${input.subject}\n${body}`,
			max_sensitivity: target.memory_max_sensitivity
		})
		: undefined;
	if (memoryContext) dataClasses.push('memory_context');

	const relayCase = stageRelayCase({
		domain: 'career',
		source_kind: 'mail',
		source_ref: sourceRef,
		subject: input.subject,
		body,
		capability: 'reply_draft',
		data_classes: dataClasses,
		...(memoryContext ? { memory_context: memoryContext } : {}),
		target
	});
	return { case: relayCase, target, created: true, body_truncated: input.body_truncated };
}
