<script lang="ts">
 import {onMount} from 'svelte';
 import {goto} from '$app/navigation';
 let isActive=$state(false);
 let tooltipLabel=$state('Pipeline · Status wird geladen');
 onMount(()=>{
  let disposed=false;
  let controller:AbortController|null=null;
  async function refresh(){
   if(document.hidden || controller)return;
   controller=new AbortController();
   const timeout=setTimeout(()=>controller?.abort(),5000);
   try {
    const response=await fetch('/api/pipeline/status',{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw Error('status_unavailable');
    const data=await response.json();
    if(typeof data.busy!=='boolean'||typeof data.label!=='string')throw Error('invalid_status');
    if(!disposed){isActive=data.busy;tooltipLabel=data.label;}
   }catch{if(!disposed){isActive=false;tooltipLabel='Pipeline · Status nicht erreichbar';}}
   finally{clearTimeout(timeout);controller=null;}
  }
  void refresh();
  const interval=setInterval(()=>void refresh(),3000);
  const visible=()=>{if(!document.hidden)void refresh();};
  document.addEventListener('visibilitychange',visible);
  return ()=>{disposed=true;clearInterval(interval);controller?.abort();document.removeEventListener('visibilitychange',visible);};
 });
</script>
<button type="button" class="worker-pill" class:active={isActive} onclick={()=>goto('/pipeline')} title={tooltipLabel} aria-label={tooltipLabel}>
 <span class="dot" class:dot-active={isActive}></span>
</button>
<style>
	.worker-pill {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 36px;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0;
		border-radius: 6px;
		transition: background 150ms;
	}
	.worker-pill:hover {
		background: var(--color-muted);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-muted-foreground);
		opacity: 0.5;
		transition: background 200ms, opacity 200ms;
	}
	.dot-active {
		background: var(--color-lumen-warm, hsl(28 92% 58%));
		opacity: 1;
		animation: worker-pulse 1.6s ease-in-out infinite;
	}

	@keyframes worker-pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.55; transform: scale(0.9); }
	}
	@media(prefers-reduced-motion:reduce){.dot-active{animation:none;}}
</style>
