<script lang="ts">
 import {monthCenters,monthLabel,type householdTimeline,type HouseholdDirection,type HouseholdView} from '$lib/ledger-household.js';
 let {view='household',rows,mode,onmonth,onprojection,band=1500,selectedMonth='',selectedDirection='debit'}:{view?:HouseholdView;rows:ReturnType<typeof householdTimeline>;mode:'bars'|'cashflow';onmonth:(month:string,direction?:HouseholdDirection)=>void;onprojection:()=>void;band?:number;selectedMonth?:string;selectedDirection?:HouseholdDirection}=$props();
 let width=$state(480);
 const W=$derived(Math.max(220,width||480)),H=218,T=24,B=39;
 const g=$derived(monthCenters(W,rows.length));
 const count=$derived(rows.filter(m=>m.actual).length);
 const limits=$derived.by(()=>{if(mode==='bars')return [0,Math.ceil(Math.max(1,...rows.filter(m=>m.actual).flatMap(m=>[m.incoming,m.outgoing]))/10000)*10000];const xs=rows.flatMap(m=>m.actual?[m.net]:[m.net-band,m.net+band]);return [Math.floor((Math.min(0,...xs)-1000)/5000)*5000,Math.ceil((Math.max(0,...xs)+1000)/5000)*5000];});
 const y=(n:number)=>H-B-(n-limits[0])/(limits[1]-limits[0])*(H-B-T);
 const ticks=$derived(mode==='bars'?[0,limits[1]/2,limits[1]]:[limits[0],0,limits[1]]);
 const tickIndices=$derived.by(()=>{const max=W<350?4:Math.floor((W-g.left-g.right)/35),stride=Math.max(1,Math.ceil(rows.length/max));const v=rows.map((_,i)=>i).filter(i=>i%stride===0);if(v.at(-1)!==rows.length-1){if(rows.length-1-(v.at(-1)??0)<stride)v.pop();v.push(rows.length-1);}return v;});
 const years=$derived.by(()=>{const groups:{year:string;first:number;last:number}[]=[];rows.forEach((m,i)=>{if(groups.at(-1)?.year===m.month.slice(0,4))groups.at(-1)!.last=i;else groups.push({year:m.month.slice(0,4),first:i,last:i});});return groups;});
 const line=(start:number,end:number)=>rows.slice(start,end).map((m,i)=>`${g.x(start+i)},${y(m.net)}`).join(' ');
 const envelope=$derived([...rows.slice(count).map((m,i)=>`${g.x(count+i)},${y(m.net+band)}`),...rows.slice(count).map((m,i)=>`${g.x(count+i)},${y(m.net-band)}`).reverse()].join(' '));
 const money=(n:number)=>new Intl.NumberFormat('de-CH',{maximumFractionDigits:0}).format(Math.round(n/100)*100);
</script>
<div class="hh-chart" bind:clientWidth={width}>
 <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={mode==='bars'?'Monatliche Zugänge und Abgänge':'Cashflow mit separat gekennzeichneter Projektion'}>
  <rect x={g.left} y={T} width={W-g.left-g.right} height={H-B-T} fill="none" stroke="var(--hh-line)"/>
  {#if count<rows.length}<rect x={g.left+count*g.step} y={T} width={(rows.length-count)*g.step} height={H-B-T} fill="var(--hh-soft)"/><line x1={g.left+count*g.step} x2={g.left+count*g.step} y1={T} y2={H-B} stroke="var(--hh-gray)" stroke-dasharray="3 4"/><text x={W-g.right} y="12" text-anchor="end">Ausblick</text>{/if}
  {#each ticks as tick}<line x1={g.left} x2={W-g.right} y1={y(tick)} y2={y(tick)} stroke="var(--hh-line)"/><text x={g.left-7} y={y(tick)+4} text-anchor="end">{Math.round(tick/1000)}k</text>{/each}
  {#if mode==='cashflow'}<polyline points={line(0,count)} fill="none" stroke="var(--hh-blue)" stroke-width="2.4"/>{#if rows.length>count}<polygon points={envelope} fill="var(--hh-blue3)" opacity=".35"/><polyline points={line(count-1,rows.length)} fill="none" stroke="var(--hh-blue)" stroke-width="2" stroke-dasharray="5 4"/>{/if}{/if}
  {#each rows as m,i}
   {@const bw=Math.min(13,g.step*.28)}
   {#if mode==='bars'&&m.actual}
    {#each ['credit','debit'] as direction}
     {@const incoming=direction==='credit'}{@const amount=incoming?m.incoming:m.outgoing}
     <a href="#household-categories" aria-label={`${monthLabel(m.month,true)}: ${incoming?(view==='household'?'Einnahmen':'Zugänge'):(view==='household'?'Ausgaben':'Abgänge')} ${money(amount)}, Kategorien öffnen`} onclick={(e)=>{e.preventDefault();onmonth(m.month,direction as HouseholdDirection);}}>
      <title>{monthLabel(m.month,true)} · {incoming?(view==='household'?'Einnahmen':'Zugänge'):(view==='household'?'Ausgaben':'Abgänge')} {money(amount)}</title>
      <rect x={g.x(i)+(incoming?-g.step/2:0)} y={T} width={g.step/2} height={H-B-T} fill={selectedMonth===m.month&&selectedDirection===direction?'var(--hh-soft)':'transparent'}/>
      <rect x={g.x(i)+(incoming?-bw-1:1)} y={y(amount)} width={bw} height={H-B-y(amount)} rx="2" fill={incoming?'var(--hh-blue)':'var(--hh-orange)'} stroke={selectedMonth===m.month&&selectedDirection===direction?'var(--hh-text)':'none'} stroke-width="1"/>
     </a>
    {/each}
   {:else}
    <a href={m.actual?'#household-categories':'#household-detail'} aria-label={`${monthLabel(m.month,true)}: ${m.actual?'Kategorien öffnen':'Projektion ansehen'}, Saldo ${money(m.net)}`} onclick={(e)=>{e.preventDefault();m.actual?onmonth(m.month):onprojection();}}>
     <title>{monthLabel(m.month,true)} · {m.actual?'Saldo':'Projektion'} {money(m.net)}</title>
     <rect x={g.x(i)-g.step/2} y={T} width={g.step} height={H-B-T} fill={selectedMonth===m.month?'var(--hh-soft)':'transparent'} opacity=".4"/>
     {#if mode==='cashflow'}<circle cx={g.x(i)} cy={y(m.net)} r={selectedMonth===m.month?5:3.5} fill={m.actual?'var(--hh-blue)':'var(--hh-bg)'} stroke="var(--hh-blue)" stroke-width="1.5"/>{/if}
    </a>
   {/if}
  {/each}
  {#each tickIndices as i}{#if rows[i]}<text x={g.x(i)} y={H-21} text-anchor="middle">{monthLabel(rows[i].month).replace('.','')}</text>{/if}{/each}
  {#each years as year}<text x={(g.x(year.first)+g.x(year.last))/2} y={H-5} text-anchor="middle">{year.year}</text>{/each}
 </svg>
</div>
