import { createHash } from 'node:crypto';
import { appendCareerLeadAction, CareerStoreError, listCareerLeads } from './store.js';
import type { CareerLeadActionInput } from './store.js';
import type { CareerLeadView } from './types.js';

export type CareerAgentCommand =
	| { action: 'acknowledge' }
	| { action: 'start_application' }
	| { action: 'snooze'; delay: 'four_hours' | 'tomorrow' };

export interface CareerAgentCommandResult {
	handled: boolean;
	executed: boolean;
	text?: string;
	lead?: CareerLeadView;
}

function normalized(message: string): string {
	return message
		.trim()
		.toLocaleLowerCase('de-CH')
		.replace(/[.!]+$/g, '')
		.replace(/\s+/g, ' ');
}

/**
 * Deliberately narrow: only explicit imperatives become local ledger writes.
 * Questions, negations and terminal truth claims fall through to advice/the slide gate.
 */
export function parseCareerAgentCommand(message: string): CareerAgentCommand | null {
	const text = normalized(message);
	if (!text || text.includes('?') || /^(?:kann|könnt|soll|was|wie|warum|can|could|should)\b/u.test(text)) return null;
	if (/\b(?:nicht|kein|keine|don't|do not)\b/u.test(text)) return null;

	if (/^(?:(?:bitte|please) )?(?:gesehen|als gesehen markieren|markiere (?:den |diesen )?(?:lead )?als gesehen|zur kenntnis nehmen|acknowledge(?: this lead)?|mark (?:this )?lead as seen)$/u.test(text)) {
		return { action: 'acknowledge' };
	}
	if (/^(?:(?:bitte|please) )?(?:bewerbung (?:beginnen|starten)|starte (?:die )?bewerbung|mit (?:der )?bewerbung beginnen|start (?:the |my )?application)$/u.test(text)) {
		return { action: 'start_application' };
	}
	if (/^(?:(?:bitte|please) )?(?:in vier stunden erinnern|vier stunden später|4 (?:std\.?|stunden) später|4 stunden zurückstellen|erinnere mich in 4 stunden|snooze (?:for )?4 hours|remind me in 4 hours)$/u.test(text)) {
		return { action: 'snooze', delay: 'four_hours' };
	}
	if (/^(?:(?:bitte|please) )?(?:morgen erinnern|bis morgen zurückstellen|erinnere mich morgen|snooze until tomorrow|remind me tomorrow)$/u.test(text)) {
		return { action: 'snooze', delay: 'tomorrow' };
	}
	return null;
}

function tomorrowMorning(now: Date): Date {
	const result = new Date(now);
	result.setDate(result.getDate() + 1);
	result.setHours(9, 0, 0, 0);
	return result;
}

function idempotencyKey(commandId: string, leadId: string, command: CareerAgentCommand): string {
	const digest = createHash('sha256')
		.update(`${commandId}\0${leadId}\0${command.action}\0${'delay' in command ? command.delay : ''}`)
		.digest('hex')
		.slice(0, 32);
	return `career-agent:${digest}`;
}

export function executeCareerAgentCommand(
	message: string,
	leadId: string,
	commandId: string,
	actorId: string,
	now = new Date()
): CareerAgentCommandResult {
	const command = parseCareerAgentCommand(message);
	if (!command) return { handled: false, executed: false };
	if (!/^[a-zA-Z0-9_-]{16,128}$/.test(commandId)) throw new CareerStoreError('invalid career agent command id');
	const lead = listCareerLeads(now).find((item) => item.lead_id === leadId);
	if (!lead) throw new CareerStoreError('unknown career lead');

	if (command.action === 'acknowledge' && lead.status === 'acknowledged') {
		return { handled: true, executed: false, text: 'Bereits als gesehen protokolliert.', lead };
	}
	if (command.action === 'start_application' && lead.status === 'started') {
		return { handled: true, executed: false, text: 'Die Bewerbung ist bereits als begonnen protokolliert.', lead };
	}

	const input: CareerLeadActionInput = {
		action: command.action,
		lead_id: lead.lead_id,
		case_id: lead.case_id,
		assessment_id: lead.assessment_id,
		expected_revision: lead.revision,
		availability_event_id: lead.availability_event_id,
		source_snapshot_hash: lead.source_snapshot_hash,
		idempotency_key: idempotencyKey(commandId, lead.lead_id, command)
	};
	if (command.action === 'snooze') {
		input.snooze_until = command.delay === 'tomorrow'
			? tomorrowMorning(now).toISOString()
			: new Date(now.getTime() + 4 * 3_600_000).toISOString();
		input.reason_code = command.delay === 'tomorrow' ? 'tomorrow' : 'later_today';
	}
	const event = appendCareerLeadAction(input, actorId, now);
	const updated = listCareerLeads(now).find((item) => item.lead_id === event.lead_id);
	if (!updated) throw new CareerStoreError('career lead projection failed');
	const text = command.action === 'acknowledge'
		? 'Als gesehen protokolliert.'
		: command.action === 'start_application'
			? 'Bewerbungsstart lokal protokolliert. Es wurde nichts extern versendet.'
			: command.delay === 'tomorrow'
				? 'Bis morgen 09:00 Uhr zurückgestellt.'
				: 'Für vier Stunden zurückgestellt.';
	return { handled: true, executed: true, text, lead: updated };
}
