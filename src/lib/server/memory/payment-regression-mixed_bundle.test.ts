/** Claude-Nachreview Belegfix: gemischtes Bündel (Vertragsinfo + offene Zahlung), synthetisch. */
import {it,expect} from 'vitest';
import {classifyMemoryWork,type ReviewBundle} from './worklists.js';
const b={facts:[{fact_id:'ctx',predicate:'paid',status:'candidate'},{fact_id:'pay',predicate:'paid',status:'candidate'}],proposal:{source_kind:'mail'},episodes:[]} as unknown as ReviewBundle;
it('N4 gemischtes Bündel: Zahlungsfall wartet, Bündel bleibt zugänglich – mit welcher Frage?',()=>{
 const w=classifyMemoryWork(b,{},[{factId:'ctx',state:'decision',route:'context',reason:'Vertragsinformation im Gedächtnis einordnen'},{factId:'pay',state:'waiting',reason:'Monatsabgleich läuft oder wartet auf Fortsetzung'}]);
 console.log('N4',JSON.stringify(w));
 expect(w.lane).toBe('decision');expect(w.kind).toBe('keep');
});
