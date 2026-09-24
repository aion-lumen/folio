<script lang="ts">
 import HouseholdNoticeList from './HouseholdNoticeList.svelte';
 import type {HouseholdDirection,HouseholdNotice} from '$lib/ledger-household.js';
 let {notices,direction,today,observed,batch}:{notices:HouseholdNotice[];direction:HouseholdDirection;today:string;observed:string;batch:string}=$props();
 let expanded=$state(false),chosen=$state('');
 const timed=$derived(notices.filter(n=>n.kind!=='unusual'));
 const upcoming=$derived(timed.filter(n=>n.date&&n.date>=today&&Date.parse(n.date)-Date.parse(today)<=30*86400000));
 const limit=$derived(new Date(Date.parse(today)+30*86400000).toISOString().slice(0,10));
 const date=(d:string)=>d.split('-').reverse().join('.');
 const x=(n:HouseholdNotice)=>Math.max(1,Math.min(99,(Date.parse(n.date!)-Date.parse(today))/86400000/30*100));
 const shown=$derived(chosen?timed.filter(n=>n.id===chosen):expanded?timed:timed.slice(0,2));
</script>
<div class="attention" class:urgent={timed.some(n=>n.urgent)}>
 <div class="head"><strong>{direction==='credit'?'Laufzeiten':'Nächste Zahlungen'}</strong><span>{direction==='credit'?'bekannter Stand':'aus dem Buchungsrhythmus'}</span></div>
 {#if upcoming.length}<div class="time-track" aria-label="Zeitachse der nächsten 30 Tage">{#each upcoming as n}<button class:urgent={n.urgent} style={`left:${x(n)}%`} title={n.label} aria-label={n.label} aria-pressed={chosen===n.id} onclick={()=>chosen=chosen===n.id?'':n.id}></button>{/each}</div><div class="dates"><span>Heute · {date(today)}</span><span>{date(limit)}</span></div>{/if}
 <HouseholdNoticeList {batch} notices={shown}/>
 {#if !timed.length}<p>{direction==='credit'?'Keine begrenzte Laufzeit hinterlegt.':observed&&observed<today?`Datenstand endet am ${date(observed)}. Für die nächsten 30 Tage liegt keine ausreichend aktuelle Prognose vor.`:'Kein belastbarer monatlicher Rhythmus für die nächsten 30 Tage erkannt.'}</p>{/if}
 {#if chosen}<button class="more" onclick={()=>chosen=''}>Alle Hinweise</button>{:else if timed.length>2}<button class="more" onclick={()=>expanded=!expanded}>{expanded?'Weniger':`${timed.length-2} weitere`}</button>{/if}
 {#if direction==='debit'}<p class="basis">Buchungen bis {date(observed)} · erwartete Termine, keine offenen Rechnungen.</p>{/if}
</div>
<style>
 .attention{padding:12px;border:1px solid var(--hh-line);border-radius:9px;margin-top:12px}.attention.urgent{border-color:#be5c6855}.head{display:flex;justify-content:space-between;gap:8px;font-size:11px}.head span,.dates{color:var(--hh-muted);font-size:10px}.time-track{height:3px;background:var(--hh-line);margin:18px 6px 8px;position:relative}.time-track button{position:absolute;top:50%;transform:translate(-50%,-50%);width:20px;height:24px;display:grid;place-items:center}.time-track button:after{content:'';display:block;width:8px;height:8px;border-radius:50%;background:var(--hh-blue);border:2px solid var(--hh-bg);box-sizing:content-box}.time-track button.urgent:after{background:var(--hh-red)}.time-track button[aria-pressed=true]:after{outline:1px solid var(--hh-red);outline-offset:2px}.dates{display:flex;justify-content:space-between;margin-bottom:10px}.attention p{font-size:11px;color:var(--hh-muted);margin:8px 0 0}.basis{font-size:10px!important}.more{font-size:11px;color:var(--hh-blue)!important}
</style>
