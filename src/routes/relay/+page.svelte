<script lang="ts">
	import { ArrowLeft, Check, Cloud, Laptop, Send, ShieldCheck } from 'lucide-svelte';
	import { goto } from '$app/navigation';

	let { data, form } = $props();

	const STATUS: Record<string, string> = {
		staged: 'wartet auf dich', approved: 'freigegeben', shared: 'bereitgestellt',
		claimed: 'wird bearbeitet', needs_context: 'Rückfrage', answered: 'Antwort da',
		reviewed: 'geprüft', applied: 'übernommen', closed: 'abgeschlossen',
		rejected: 'verworfen', expired: 'abgelaufen'
	};
</script>

<svelte:head><title>Folio · Übergaben</title></svelte:head>

<div class="page">
	<header class="page-header">
		<button class="back" type="button" onclick={() => goto('/')}><ArrowLeft size={16} /> Heute</button>
		<div class="title-row">
			<div><span class="eyebrow">Session Relay</span><h1>Übergaben</h1></div>
			<span class="count">{data.cases.length} {data.cases.length === 1 ? 'Fall' : 'Fälle'}</span>
		</div>
		<p>Hier gibst du einen Fall für die zuständige Session frei. Der Rückweg für Antwort, Rückfrage oder Objective folgt im nächsten Schritt.</p>
	</header>

	{#if form?.message}<div class="notice error" role="alert">{form.message}</div>{/if}
	{#if form?.success}<div class="notice success" role="status"><Check size={16} /> Übergabe bereitgestellt.</div>{/if}

	{#if !data.targetsConfigured}
		<div class="empty"><h2>Noch kein Ziel eingerichtet</h2><p>Eine frische Installation startet ohne Cloud-Ziel. Lokale Hermes-Agenten oder Cowork-Sessions werden später über ein Manifest verbunden.</p></div>
	{:else if data.cases.length === 0}
		<div class="empty"><h2>Alles ruhig</h2><p>Sobald eine Mail eine Domänen-Session braucht, erscheint sie hier.</p></div>
	{:else}
		<div class="case-list">
			{#each data.cases as item (item.case_id)}
				<article class="case" class:done={item.status === 'shared'}>
					<header>
						<div class="target-icon" class:cloud={item.target_locality === 'cloud'}>
							{#if item.target_locality === 'cloud'}<Cloud size={19} />{:else}<Laptop size={19} />{/if}
						</div>
						<div class="case-title"><span>{item.target_label}</span><h2>{item.subject}</h2></div>
						<span class="status">{STATUS[item.status] ?? item.status}</span>
					</header>

					<div class="meta">
						<span>{item.domain === 'career' ? 'Karriere' : item.domain}</span>
						<span>{item.capability === 'reply_draft' ? 'Antwortentwurf' : item.capability}</span>
						{#each item.data_classes as cls}<span>{cls.replaceAll('_', ' ')}</span>{/each}
					</div>

					<div class="preview"><span class="preview-label">Freigegebener Inhalt</span><p>{item.preview}</p></div>

					<footer>
						<div class="trust">
							<ShieldCheck size={17} />
							{#if item.target_locality === 'cloud'}
								<span>Diese Übergabe geht an eine Online-Session. Die Freigabe gilt nur für genau diesen Stand.</span>
							{:else}
								<span>Bleibt lokal auf diesem Gerät.</span>
							{/if}
						</div>
						{#if item.status === 'staged'}
							<form method="POST" action="?/share">
								<input type="hidden" name="case_id" value={item.case_id} />
								<button class="share" type="submit"><Send size={16} /> Für Session freigeben</button>
							</form>
						{:else if item.status === 'shared'}
							<span class="shared"><Check size={16} /> Im freigegebenen Ordner</span>
						{/if}
					</footer>
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page { max-width: 900px; margin: 0 auto; padding: 40px 28px 72px; display: flex; flex-direction: column; gap: 24px; }
	.page-header { display: flex; flex-direction: column; gap: 8px; }
	.back { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; border: 0; background: none; padding: 0; color: var(--color-muted-foreground); font: inherit; cursor: pointer; }
	.title-row { display: flex; align-items: end; justify-content: space-between; gap: 16px; }
	h1, h2, p { margin: 0; } h1 { font-size: 29px; } h2 { font-size: 17px; }
	.page-header p { max-width: 690px; color: var(--color-muted-foreground); font-size: 13px; line-height: 1.5; }
	.eyebrow, .preview-label { display: block; color: var(--color-muted-foreground); font-size: 10px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
	.count, .status { border-radius: 999px; background: var(--color-muted); padding: 5px 9px; color: var(--color-muted-foreground); font-size: 11px; }
	.case-list { display: flex; flex-direction: column; gap: 14px; }
	.case { border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-card); overflow: hidden; }
	.case.done { border-color: hsl(158 34% 72%); }
	.case > header { display: grid; grid-template-columns: 42px 1fr auto; gap: 12px; align-items: center; padding: 18px 20px 12px; }
	.target-icon { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; color: hsl(158 52% 34%); background: hsl(158 42% 92%); }
	.target-icon.cloud { color: hsl(28 72% 42%); background: hsl(36 78% 93%); }
	.case-title span { display: block; margin-bottom: 2px; color: var(--color-muted-foreground); font-size: 11px; }
	.meta { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 20px 14px 74px; }
	.meta span { border: 1px solid var(--color-border); border-radius: 6px; padding: 3px 7px; color: var(--color-muted-foreground); font-size: 10px; }
	.preview { margin: 0 20px 18px 74px; border-radius: 11px; background: var(--color-muted); padding: 13px 14px; }
	.preview p { margin-top: 7px; white-space: pre-wrap; font-size: 13px; line-height: 1.55; }
	.case footer { display: flex; justify-content: space-between; align-items: center; gap: 18px; border-top: 1px solid var(--color-border); padding: 14px 20px; }
	.trust { display: flex; align-items: center; gap: 8px; max-width: 560px; color: var(--color-muted-foreground); font-size: 11px; line-height: 1.4; }
	.trust :global(svg) { flex: 0 0 auto; }
	.share { display: inline-flex; align-items: center; gap: 7px; border: 0; border-radius: 9px; padding: 10px 14px; background: hsl(158 52% 34%); color: white; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; white-space: nowrap; }
	.shared, .notice { display: inline-flex; align-items: center; gap: 7px; color: hsl(158 52% 30%); font-size: 12px; font-weight: 600; }
	.notice { border-radius: 10px; padding: 11px 13px; background: hsl(158 42% 92%); }
	.notice.error { color: hsl(0 56% 38%); background: hsl(0 65% 94%); }
	.empty { border: 1px dashed var(--color-border); border-radius: 15px; padding: 34px; text-align: center; }
	.empty p { margin-top: 6px; color: var(--color-muted-foreground); font-size: 13px; }
	@media (max-width: 620px) { .page { padding: 28px 16px 56px; } .case > header { grid-template-columns: 38px 1fr; } .status { grid-column: 2; justify-self: start; } .meta, .preview { margin-left: 16px; padding-left: 0; } .preview { padding: 13px 14px; } .case footer { align-items: stretch; flex-direction: column; } .share { width: 100%; justify-content: center; } }
</style>
