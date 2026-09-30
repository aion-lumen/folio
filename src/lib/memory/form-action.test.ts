import { expect, it } from 'vitest';
import { memoryFormAction } from './form-action.js';
it('retains the review tab, domain, kind, limit and focused proposal', () => {
 const result = new URL(memoryFormAction('?view=review&work_domain=career&kind=repair&limit=25&proposal=abc', 'confirmProposal'), 'http://folio/memory');
 expect(result.pathname).toBe('/memory');
 expect(Object.fromEntries(result.searchParams)).toEqual({view:'review',work_domain:'career',kind:'repair',limit:'25',proposal:'abc','/confirmProposal':''});
});
it('replaces the previous action without losing encoded searches', () => {
 const result = new URL(memoryFormAction('?view=processing&q=A%26B&%2FrejectSource=', 'confirmSource'), 'http://folio/memory');
 expect(result.searchParams.get('q')).toBe('A&B');
 expect(result.searchParams.has('/rejectSource')).toBe(false);
 expect(result.searchParams.has('/confirmSource')).toBe(true);
});
