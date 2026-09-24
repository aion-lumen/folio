<script lang="ts">
 let {data}:{data:{items:{id:string;title:string;date:string;candidate:boolean;possible:boolean;urgent:boolean;href:string;status?:string;evidenceCount?:number}[];counts?:{ready:number;needsDetails:number;existing:number;deadlines:number;unresolved:number;past:number};syncedAt:string|null;unavailable:boolean}}=$props();
</script>
{#if data.items.length || data.counts?.deadlines || data.unavailable}
<section class="appointments" aria-label="Termine abgleichen">
 <h2>Terminvorschläge <span>{data.items.length}</span></h2>
 {#if data.unavailable}<p role="alert">Kalenderabgleich nicht verfügbar.{#if data.syncedAt} Letzter Abgleich: {new Date(data.syncedAt).toLocaleString('de-CH',{timeZone:'Europe/Zurich'})}.{/if} <a href="/settings#calendar">Verbindung prüfen →</a></p>{/if}
 {#each data.items.slice(0,5) as item (item.id)}
 <a href={item.href} class:urgent={item.urgent}><span>{item.date} · {item.status==='needs_details'?'Angaben fehlen':item.candidate?'Modellvorschlag':'Bestätigte Quelle'}{#if item.evidenceCount && item.evidenceCount>1} · {item.evidenceCount} Belege{/if}</span><strong>{item.title}</strong><small>{item.possible?'Datum und Uhrzeit ergänzen':'Vorschlag prüfen'} →</small></a>
 {/each}
 {#if data.items.length>5}<a href="/calendar">Alle Termine prüfen →</a>{/if}
 {#if data.counts?.deadlines}<a class="deadlines" href="/calendar#deadlines"><span>{data.counts.deadlines} Fristen oder Rechnungsbelege</span><small>Getrennt von Terminvorschlägen ansehen →</small></a>{/if}
</section>
{/if}
<style>
 .appointments{margin:20px 0;padding:20px;border:1px solid #dbe2eb;border-radius:14px;background:white;color:#172435}.appointments h2{font-size:17px;margin:0 0 12px}.appointments h2 span{font-size:12px;color:#64748b}.appointments>a{display:flex;flex-direction:column;gap:5px;border-top:1px solid #e2e8f0;padding:13px 0;color:inherit;text-decoration:none;overflow-wrap:anywhere}.appointments span,.appointments small,.appointments p{font-size:12px;color:#64748b}.appointments strong{font-size:14px}.appointments .urgent small{color:#9a5b16}.appointments .deadlines{margin-top:3px;color:#52616f}
</style>
