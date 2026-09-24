<script lang="ts">
 import {ArrowLeft,ArrowRight,LoaderCircle} from 'lucide-svelte';
 let {url,label}:{url:string;label:string}=$props();
 let page=$state(1),pages=$state(1),image=$state(''),loading=$state(true),failure=$state('');
 $effect(()=>{
  const controller=new AbortController();let objectUrl='';
  loading=true;failure='';image='';
  fetch(`${url}&preview=1&page=${page}`,{signal:controller.signal}).then(async r=>{
   if(!r.ok)throw Error('Vorschau nicht verfügbar. Das Original lässt sich oben herunterladen.');
   const count=Number(r.headers.get('x-document-pages'));const blob=await r.blob();
   if(controller.signal.aborted)return;
   pages=count;objectUrl=URL.createObjectURL(blob);image=objectUrl;
  }).catch(e=>{if(!controller.signal.aborted)failure=e.message;}).finally(()=>{if(!controller.signal.aborted)loading=false;});
  return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 });
</script>
<div class="preview" aria-busy={loading}>
 <div class="pages"><button disabled={loading||page===1} aria-label="Vorherige Belegseite" onclick={()=>page--}><ArrowLeft size={16}/></button><span>Seite {page} / {pages}</span><button disabled={loading||page>=pages} aria-label="Nächste Belegseite" onclick={()=>page++}><ArrowRight size={16}/></button></div>
 {#if loading}<p class="state"><LoaderCircle size={18}/> Belegvorschau laden …</p>{:else if failure}<p class="state" role="status">{failure}</p>{:else}<img src={image} alt={`${label} · Seite ${page}`} />{/if}
</div>
<style>
 .preview{border:1px solid var(--hh-line);border-radius:8px;overflow:hidden;background:var(--hh-soft)}.pages{display:flex;justify-content:space-between;align-items:center;font-size:12px;background:var(--hh-bg);padding:7px 10px;border-bottom:1px solid var(--hh-line)}.pages button{padding:8px}.pages button:disabled{opacity:.3}.preview img{display:block;width:100%;height:auto}.state{display:flex;align-items:center;justify-content:center;gap:8px;min-height:240px;padding:20px;font-size:12px}
</style>
