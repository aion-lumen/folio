<script lang="ts">
 import type { PageData } from './$types.js';
 import RunStatus from '$lib/pipeline/RunStatus.svelte';
 import LiveDetail from '$lib/pipeline/LiveDetail.svelte';
 import PipelineRunList from '$lib/pipeline/history/PipelineRunList.svelte';
 import Workbench from '$lib/pipeline/workbench/Workbench.svelte';
 import TweaksPanel from '$lib/pipeline/TweaksPanel.svelte';
 import type { PipelineView } from '$lib/pipeline/types.js';
 import { browser } from '$app/environment';
 import { invalidateAll } from '$app/navigation';

 let {data}:{data:PageData} = $props();
 let account = $state('');
 $effect(()=>{if(!data.accounts.some(a=>a.id===account))account=data.accounts[0]?.id??'';});
 let trancheSize = $state(30);
 let submitting = $state(false);
 let error = $state('');
 const TRANCHE_PRESETS = [5,10,30];
 const isIdle = $derived(!data.status.active && !data.activeRun);
 const statusLabel = $derived(data.activeRun && !data.status.active ? 'Einzellauf läuft' : data.status.state);
 const roleLabels:Record<string,string> = {router:'Router',control_llm:'Kontrollmodell',primary_llm:'Primärmodell',conditional_reviewer:'Bei Uneinigkeit · unabhängige Prüfung'};
 const models = $derived(data.regelwerk?.voice_consensus.voices.filter(v=>v.enabled!==false && v.role!=='deterministic' && v.lm_studio_model).map(v=>({id:v.lm_studio_model!,role:roleLabels[v.role] ?? v.id})) ?? []);
 // Poll even while idle: scheduled runs and Memory have no active worker subprocess.
 $effect(()=>{
  if(!browser) return;
  let fetching=false;
  const id=setInterval(async()=>{if(fetching || document.hidden)return;fetching=true;try{await invalidateAll();}finally{fetching=false;}},3000);
  const refresh=()=>{if(!document.hidden)void invalidateAll();};
  document.addEventListener('visibilitychange',refresh);
  return ()=>{clearInterval(id);document.removeEventListener('visibilitychange',refresh);};
 });
 let view=$state<PipelineView>('fluss');
 $effect(()=>{
  if(!browser)return;
  const saved=localStorage.getItem('pipeline.view');
  if(saved==='fluss'||saved==='werkbank')view=saved;
  const n=Number(localStorage.getItem('pipeline.lastTrancheSize'));
  if(TRANCHE_PRESETS.includes(n))trancheSize=n;
 });
 function setView(v:PipelineView){view=v;if(browser)localStorage.setItem('pipeline.view',v);}
 function setTrancheSize(n:number){trancheSize=n;if(browser)localStorage.setItem('pipeline.lastTrancheSize',String(n));}
 async function start(){
  submitting=true;error='';
  try {
   const response=await fetch('/api/mail/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'run_now',account,batch_size:trancheSize,history:false})});
   if(!response.ok)throw Error(response.status===409?'Maileingang pausiert oder bereits belegt. Bitte Status und Steuerung prüfen.':'Start nicht möglich. Bitte Status und Steuerung prüfen.');
   await invalidateAll();
  }catch(e){error=e instanceof Error?e.message:'Start fehlgeschlagen';}finally{submitting=false;}
 }
</script>

<a href="/mail-intake" style="display:block;padding:16px 28px;color:#35665c">Automatischer Maileingang · Status und Steuerung ↗</a>
<svelte:head>
	<title>Folio · Pipeline</title>
</svelte:head>

<div class="pl-page">
	<header class="pl-head">
		<div class="pl-head-text">
			<h1>Pipeline</h1>
			<p class="pl-sub">
				Maileingang, lokale Modellprüfung und Memory — ein gemeinsamer Lauf.
			</p>
		</div>
		<div class="head-actions">
			<a class="model-eval-link" href="/pipeline/modelle">Modelle vergleichen</a>
			<div class="pl-statuspill" class:idle={isIdle}>
				<span class="dot" class:idle={isIdle}></span>
				<span class="label">{statusLabel}</span>
			</div>
		</div>
	</header>

	<!-- Config-Bar: Account + Tranche-Picker + „Jetzt prüfen" via existing workerRunStore -->
	<div class="config">
		<span class="ck">ACCOUNT</span>
		<select class="sel" aria-label="Account" bind:value={account}>
			{#each data.accounts as source}<option value={source.id}>{source.label}</option>{/each}
		</select>
		<span class="ck">TRANCHE</span>
		<select
			class="sel"
			aria-label="Tranche-Größe"
			value={trancheSize}
			onchange={(e) => setTrancheSize(Number((e.currentTarget as HTMLSelectElement).value))}
		>
			{#each TRANCHE_PRESETS as n}
				<option value={n}>{n}</option>
			{/each}
		</select>
		<span class="ck-hint">gemeinsamer Intake · Tranche {trancheSize}</span>
		<button
			type="button"
			class="dark-btn"
			disabled={submitting || !!data.activeRun || data.status.active || data.status.state === 'Wartet' || !data.intakeEnabled}
			onclick={start}
		>
			{submitting ? 'Starte …' : '▷ Jetzt prüfen'}
		</button>
		{#if error}
			<span class="err">{error}</span>
		{/if}
	</div>

	<RunStatus status={data.status} {models} />
	{#if view === 'fluss'}
        {#if data.activeRun && !data.status.active}
          <p class="pl-sub">Separater {data.activeRun.mode === 'validator' ? 'Validator' : 'Worker'}-Lauf · nicht Teil des oben angezeigten Intake-Laufs.
          {data.standaloneActivity ? data.standaloneActivity.model + ' · ' + data.standaloneActivity.task : 'Kein aktives Modell bestätigt'}</p>
        {/if}

		<!-- Live-Detail (nur wenn aktiv) -->
		{#if data.activeRun}
			<LiveDetail
				activeRun={data.activeRun}
				summary={data.activeSummary}
				logs={data.activeLogs ?? []}
                showProgress={false}
                hideCouncil={true}
			/>
		{/if}

		<!-- Verlauf: Tagesgruppierung + Lauf-Spur-Aufklappung.
		     hideCouncil → nur mail-side Runs (Council-Lens/-Ingest raus). -->
		<div class="eyebrow">
			<span>VERLAUF</span>
		</div>
		<PipelineRunList
			runs={data.pipelineRuns.filter((r) => r.source === 'mail')}
		/>
	{:else}
		<!-- Werkbank: alternative Master-Detail-Sicht -->
		<div class="eyebrow">
			<span>WERKBANK</span>
		</div>
		<Workbench runs={data.pipelineRuns.filter((r) => r.source === 'mail')} />
	{/if}
</div>

<TweaksPanel {view} onChange={setView} />

<style>
	.pl-page {
		max-width: 1240px;
		margin: 0 auto;
		padding: 30px 26px 120px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.pl-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}
	.pl-head-text h1 {
		margin: 0 0 4px;
		font-size: 30px;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: hsl(222 47% 11%);
	}
	.pl-sub {
		margin: 0;
		font-size: 14px;
		color: hsl(215 16% 47%);
	}

	.pl-statuspill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 7px 12px;
		border: 1px solid hsl(142 50% 80%);
		border-radius: 999px;
		background: hsl(138 60% 96%);
		color: hsl(142 64% 36%);
		font-size: 12.5px;
		font-weight: 500;
		flex-shrink: 0;
	}
	.head-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.model-eval-link {
		padding: 7px 11px;
		border: 1px solid hsl(214 25% 86%);
		border-radius: 999px;
		color: hsl(215 17% 38%);
		font-size: 12px;
		text-decoration: none;
	}
	.model-eval-link:hover { border-color: hsl(181 40% 58%); color: hsl(181 52% 28%); }
	.pl-statuspill.idle {
		border-color: hsl(214 20% 86%);
		background: hsl(210 20% 98%);
		color: hsl(215 16% 45%);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: hsl(142 64% 42%);
		animation: pulse 1.6s ease-in-out infinite;
	}
	.dot.idle {
		background: hsl(215 16% 55%);
		animation: none;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.55; transform: scale(0.88); }
	}

	.config {
		background: white;
		border: 1px solid hsl(214 25% 90%);
		border-radius: 12px;
		padding: 14px 16px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.ck {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
	}
	.ck-hint {
		font-size: 12px;
		color: hsl(215 16% 47%);
		margin-left: auto;
	}
	.sel {
		border: 1px solid hsl(214 25% 90%);
		border-radius: 8px;
		padding: 5px 10px;
		font-size: 13px;
		background: hsl(210 30% 99%);
		font-family: inherit;
	}
	.dark-btn {
		background: hsl(222 47% 11%);
		color: white;
		border: 0;
		border-radius: 9px;
		padding: 8px 14px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
	}
	.dark-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.err {
		margin-left: 8px;
		font-size: 12px;
		color: hsl(0 65% 38%);
	}

	.eyebrow {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
		margin-top: 6px;
	}
	@media(max-width:700px) {
		.pl-page {padding:24px 20px 80px;}
		.pl-head {flex-direction:column;}
		.head-actions {flex-wrap:wrap;}
		.config {flex-wrap:wrap;gap:10px;}
		.ck-hint {flex-basis:100%;margin-left:0;}
		.sel {font-size:16px;min-height:44px;}
		.dark-btn {min-height:44px;}
	}
</style>
