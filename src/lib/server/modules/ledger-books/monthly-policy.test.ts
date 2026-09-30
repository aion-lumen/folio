import { expect,it } from 'vitest';
import { coveredStatementMonths, type StatementSource } from './monthly-policy.js';
const source=(from:string,to:string,account='A',complete=true):StatementSource=>({account_ref:account,declared_period:{from,to},control_result:{complete}});
it('waits for a full month on the exact account',()=>{
 expect([...coveredStatementMonths([source('2026-09-01','2026-09-29'),source('2026-09-01','2026-09-30','B')],'A')]).toEqual([]);
 expect([...coveredStatementMonths([source('2026-09-01','2026-09-30')],'A')]).toEqual(['2026-09']);
});
it('combines contiguous valid coverage but not gaps or unrelated accounts',()=>{
 expect([...coveredStatementMonths([source('2026-09-01','2026-09-15'),source('2026-09-16','2026-09-30')],'A')]).toEqual(['2026-09']);
 for(const sources of [[source('2026-09-01','2026-09-14'),source('2026-09-16','2026-09-30')],[source('2026-09-01','2026-09-15'),source('2026-09-16','2026-09-30','B')],[source('2026-09-01','2026-09-30','A',false)]])expect(coveredStatementMonths(sources,'A').size).toBe(0);
});
it('covers every complete month of quarterly statements and ignores duplicates',()=>{
 const s=source('2026-07-01','2026-09-30');expect([...coveredStatementMonths([s,s],'A')]).toEqual(['2026-07','2026-08','2026-09']);
});
it('handles leap years and rejects invalid dates',()=>{
 expect([...coveredStatementMonths([source('2024-02-01','2024-02-29')],'A')]).toEqual(['2024-02']);
 expect(coveredStatementMonths([source('2026-02-01','2026-02-29')],'A').size).toBe(0);
});
