import {describe,expect,it} from 'vitest';
import {calendarDomain,calendarDomainLabel} from './domain.js';

describe('calendar domain palette',()=>{
	it('maps Memory vocabulary onto the mail classification taxonomy',()=>{
		expect(calendarDomain('career')).toBe('job');
		expect(calendarDomain('property')).toBe('immo');
		expect(calendarDomain('personal')).toBe('kontakt');
		expect(calendarDomain('financial')).toBe('finance');
	});
	it('keeps unknown and absent domains neutral',()=>{
		expect(calendarDomain('unknown-domain')).toBe('unsorted');
		expect(calendarDomain(undefined)).toBe('unsorted');
		expect(calendarDomainLabel(undefined)).toBe('Unsortiert');
	});
});
