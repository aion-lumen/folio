import {expect,it} from 'vitest';
import {statementPeriodLabel} from './household-evidence.js';
it('shows the full statement range without implying a PDF page',()=>{expect(statementPeriodLabel({from:'2026-07-01',to:'2026-09-30'},'2026-08-12')).toBe('2026-07 – 2026-09');expect(statementPeriodLabel({from:'2026-08-01',to:'2026-08-31'},'2026-08-12')).toBe('2026-08');expect(statementPeriodLabel(undefined,'2026-08-12')).toBe('2026-08');});
