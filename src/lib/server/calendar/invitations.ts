import { createHash } from 'node:crypto';
import { audit, readPrivate, savePrivate } from './store.js';
import type { CalendarSource, EventDraft } from './planning.js';
import type { CalendarEvent } from './store.js';

export interface CalendarInvitee { role: string; email: string; }
export interface FamilyInvitationRule {
	version: 1;
	id: string;
	invitees: CalendarInvitee[];
	matchTerms: string[];
	learnedAt: string;
	sourceEventHash: string;
}

const FILE = 'family-invitation-rule';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInvitees(invitees: CalendarInvitee[]): CalendarInvitee[] {
	if (!invitees.length || invitees.length > 10) throw new Error('Einladungen müssen 1 bis 10 eindeutige Kontakte enthalten.');
	const seen = new Set<string>();
	return invitees.map((invitee) => {
		const email = invitee.email.trim().toLocaleLowerCase('en-US');
		const role = invitee.role.trim();
		if (!EMAIL.test(email) || email.length > 254 || !role || role.length > 80 || seen.has(email)) throw new Error('Einladungskontakte sind ungültig oder doppelt.');
		seen.add(email);
		return { role, email };
	});
}

export function saveFamilyInvitationRule(input: Omit<FamilyInvitationRule,'version'|'learnedAt'|'sourceEventHash'> & {sourceEventId:string}) {
	const matchTerms = [...new Set(input.matchTerms.map(term=>term.trim().toLocaleLowerCase('de-CH')).filter(term=>term.length>=4))].slice(0,20);
	if (!input.id.trim() || !matchTerms.length || !input.sourceEventId) throw new Error('Die Familienregel ist unvollständig.');
	const rule:FamilyInvitationRule={version:1,id:input.id.trim(),invitees:validateInvitees(input.invitees),matchTerms,learnedAt:new Date().toISOString(),sourceEventHash:createHash('sha256').update(input.sourceEventId).digest('hex')};
	savePrivate(FILE,rule);
	audit('family_invitation_rule_configured',{ruleId:rule.id,roles:rule.invitees.map(invitee=>invitee.role),sourceEventHash:rule.sourceEventHash});
	return rule;
}

export function familyInvitationRule(): FamilyInvitationRule | null {
	const rule=readPrivate<FamilyInvitationRule>(FILE);
	if(!rule||rule.version!==1)return null;
	try{return {...rule,invitees:validateInvitees(rule.invitees)};}catch{return null;}
}

export function withFamilyInvitees(source:Pick<CalendarSource,'subject'|'value_text'>,draft:EventDraft):EventDraft {
	const rule=familyInvitationRule();if(!rule)return draft;
	const text=`${source.subject}\n${source.value_text}`.toLocaleLowerCase('de-CH');
	if(!rule.matchTerms.some(term=>text.includes(term)))return draft;
	return {...draft,attendees:rule.invitees,invitationRuleId:rule.id};
}

export function withInviteeResponses(events:CalendarEvent[]):CalendarEvent[]{
	const rule=familyInvitationRule();
	const roles=new Map(rule?.invitees.map(invitee=>[createHash('sha256').update(invitee.email.trim().toLocaleLowerCase('en-US')).digest('hex'),invitee.role])??[]);
	return events.map(({attendeeResponses,...event})=>{
		const inviteeResponses=attendeeResponses?.map(response=>({role:roles.get(response.emailHash)??'Gast',responseStatus:response.responseStatus}));
		return {...event,...(inviteeResponses?.length?{inviteeResponses}:{})};
	});
}
