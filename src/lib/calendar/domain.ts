import { DOMAIN_LABELS, type DomainKey } from '$lib/util/mail-account.js';

export type CalendarDomain = DomainKey;

export const CALENDAR_DOMAIN_ORDER: CalendarDomain[] = [
	'immo',
	'job',
	'shopping',
	'finance',
	'kontakt',
	'werbung',
	'system',
	'unsorted'
];

/** Map Memory's semantic vocabulary onto the established mail-domain palette. */
export function calendarDomain(value: string | null | undefined): CalendarDomain {
	switch ((value ?? '').trim().toLocaleLowerCase('de-CH')) {
		case 'immo':
		case 'immobilien':
		case 'property':
			return 'immo';
		case 'job':
		case 'career':
		case 'karriere':
		case 'job-lead':
			return 'job';
		case 'shopping':
		case 'shop':
		case 'commerce':
			return 'shopping';
		case 'finance':
		case 'finanzen':
		case 'financial':
			return 'finance';
		case 'kontakt':
		case 'contact':
		case 'personal':
		case 'family':
			return 'kontakt';
		case 'werbung':
		case 'marketing':
		case 'promotion':
			return 'werbung';
		case 'system':
		case 'security':
			return 'system';
		default:
			return 'unsorted';
	}
}

export function calendarDomainLabel(value: string | null | undefined): string {
	return DOMAIN_LABELS[calendarDomain(value)];
}

export function calendarDomainClass(value: string | null | undefined): string {
	return `domain-${calendarDomain(value)}`;
}
