<script lang="ts">
 let {points,currency,label}:{points:{date:string;amount:string}[];currency:string;label:string}=$props();
 const money=(n:number)=>new Intl.NumberFormat('de-CH',{style:'currency',currency,maximumFractionDigits:0}).format(n);
 const chart=$derived.by(()=>{
  const p=points.map(p=>({day:Date.parse(p.date),n:Number(p.amount),date:p.date}));
  if(!p.length)return null;
  const lo=Math.min(0,...p.map(p=>p.n)),hi=Math.max(1,...p.map(p=>p.n));
  const first=p[0].day,last=p.at(-1)!.day;
  const mapped=p.map(v=>({...v,x:last===first?400:68+(v.day-first)/(last-first)*692,y:190-(v.n-lo)/(hi-lo)*164}));
  return {points:mapped,line:mapped.map(p=>`${p.x},${p.y}`).join(' '),lo,hi};
 });
</script>
{#if chart}
<svg viewBox="0 0 800 234" role="img" aria-label={label}>
 <title>{label}</title>
 <line x1="68" x2="760" y1="26" y2="26" stroke="#e7edf3"/><line x1="68" x2="760" y1="190" y2="190" stroke="#dbe3eb"/>
 <text x="4" y="20">{money(chart.hi)}</text><text x="4" y="207">{money(chart.lo)}</text>
 {#if chart.points.length>1}<polyline points={chart.line} fill="none" stroke="#4a73b7" stroke-width="3" stroke-linejoin="round"/>{/if}
 {#each chart.points as p}<circle cx={p.x} cy={p.y} r={chart.points.length<20?4:2} fill="#4a73b7"><title>{p.date}: {money(p.n)}</title></circle>{/each}
 <text x="68" y="230">{chart.points[0].date}</text><text x="760" y="230" text-anchor="end">{chart.points.at(-1)!.date}</text>
</svg>
{/if}
<style>svg{display:block;width:100%;height:auto;overflow:visible}text{font:11px system-ui;fill:#748298}circle:hover{r:6;fill:#f59b26}</style>
