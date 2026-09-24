import {describe,it,expect} from 'vitest';
import {monthDays,onDay,dayKey} from './month';
describe('Zurich calendar grid',()=>{
 it('starts Monday and crosses year boundaries',()=>{const days=monthDays('2027-01');expect(days).toHaveLength(42);expect(days[0]).toBe('2026-12-28');});
 it('uses exclusive all-day end dates',()=>{const e={id:'1',start:{date:'2026-09-08'},end:{date:'2026-09-10'}};expect(onDay(e,'2026-09-09')).toBe(true);expect(onDay(e,'2026-09-10')).toBe(false);});
 it('uses Zurich time and excludes midnight end from next day',()=>{const e={id:'2',start:{dateTime:'2026-09-08T21:00:00Z'},end:{dateTime:'2026-09-08T22:00:00Z'}};expect(dayKey(new Date(e.start.dateTime))).toBe('2026-09-08');expect(onDay(e,'2026-09-09')).toBe(false);});
 it('covers timed events across DST and excludes cancelled events',()=>{const e={id:'3',start:{dateTime:'2026-10-24T21:00:00Z'},end:{dateTime:'2026-10-25T02:00:00Z'}};expect(onDay(e,'2026-10-25')).toBe(true);expect(onDay({...e,status:'cancelled'},'2026-10-25')).toBe(false);});
});
