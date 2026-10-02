<script lang="ts">
 import {onMount} from 'svelte';
 import {invalidateAll} from '$app/navigation';
 import {enhance} from '$app/forms';
 import type {statementJob} from '$lib/server/modules/ledger-books/statement-jobs.js';
 import type {memoryWorkStatus,monthlyPaymentAutomation} from '$lib/server/memory/work-runtime.js';
	import type { readManualStatementImport } from '$lib/server/modules/ledger-books/manual-import.js';
	let { status,job=null,monthly,automation=null,statements={},inventoryError=null }: { status: ReturnType<typeof readManualStatementImport>;statements?:ReturnType<typeof memoryWorkStatus>['statements'];inventoryError?:string|null;job?:ReturnType<typeof statementJob>;monthly?:ReturnType<typeof memoryWorkStatus>['monthly']|null;automation?:ReturnType<typeof monthlyPaymentAutomation>|null } = $props();
 onMount(()=>{const t=setInterval(()=>{if(job&&['queued','running'].includes(job.status)||automation?.enabled)void invalidateAll();},10000);return()=>clearInterval(t);});
	function money(amount: string, currency: string) { return new Intl.NumberFormat('de-CH', { style: 'currency', currency }).format(Number(amount)); }
	let selection = $state('');
	let account = $state('');
	let profile = $state('');
	const selected = $derived(status.files.find(f => f.id === selection));
	const registered = $derived(selected?.accounts.find(a => a.ref === account));
	$effect(() => { if (selected?.accounts.length === 1 && !account) account = selected.accounts[0].ref; });
	$effect(() => { if (registered?.profiles.length === 1 && !profile) profile = registered.profiles[0]; });
</script>

<section class="manual-import" aria-label="Kontoauszug manuell prüfen">
	<header><div><span>KONTOAUSZÜGE · LOKAL</span><h2>Export prüfen</h2></div><small>{status.files.length} Dateien · {status.scanner.ready ? 'Scanner vorbereitet' : 'Sicherheitscheck beim Import'}</small></header>
	<p>Aus dem Finanz-Eingang, ohne Verschieben. Saldenprüfung und Monatsabgleich laufen im Hintergrund.</p>
 {#if automation}
 <form method="POST" action="?/monthlyAutomation" use:enhance>
  <input type="hidden" name="enabled" value={String(!automation.enabled)}/>
  <button disabled={!status.configured||automation.paused}>{automation.enabled?'Monatsabgleich deaktivieren':'Monatsabgleich aktivieren'}</button>
  <small>Alle Monatsauszüge einlesen → Zahlungen zuordnen → offene Fragen vorlegen.</small>
 </form>
 {#if automation.paused}<p><a href="/memory?view=processing">Memory-Nacharbeit fortsetzen</a></p>{:else if !automation.ready}<p>Startet, sobald Folio im Dauerbetrieb läuft.</p>{/if}
 {/if}
	{#if job}<p role="status">{job.message}</p>{/if}
 {#if monthly}<p role="status">Monatsabgleich · {automation?.deactivated||monthly.status==='deactivated'?'deaktiviert':monthly.status==='completed'?'abgeschlossen':monthly.status==='paused'?'pausiert':monthly.attempts>=3?'angehalten':monthly.status==='retry'?'wird erneut versucht':monthly.status==='running'?'läuft':'vorbereitet'} · {monthly.attempted.length} Belege geprüft · {monthly.recorded} neu abgeglichen</p>{#if monthly.status==='running'&&monthly.message}<p>{monthly.message}</p>{/if}{/if}
 {#if inventoryError}<p role="alert">{inventoryError}</p>{/if}
 {#each Object.entries(statements??{}).filter(([,item])=>['retry','blocked'].includes(item.status)) as [id,item]}
 <p role="status">{status.files.find(f=>f.id===id)?.name??'Kontoauszug'} · {item.status==='retry'?'Erneuter Import vorgesehen':'Import angehalten'} · {['scanner_or_signatures_unavailable','scan_incomplete_or_error','scanner_version_unverified'].includes(item.reason??'')?'Sicherheitsprüfung nicht verfügbar':item.reason==='account_or_format_ambiguous'?'Konto oder Format zuordnen':item.reason==='malware_detected'?'Sicherheitsprüfung hat die Datei gesperrt':'Datei konnte nicht vollständig geprüft werden'} ({item.attempts??0} Versuche)</p>
 {/each}
 {#if monthly?.error}<p role="alert">{monthly.error==='ledger_companion_update_required'?'Ledger-Begleiter aktualisieren.':monthly.error.startsWith('payment_match_')?'Der Bankabgleich konnte technisch nicht abgeschlossen werden.':'Lokale Prüfung konnte nicht abgeschlossen werden.'}</p>{/if}
 {#if inventoryError||monthly?.error||Object.values(statements??{}).some(item=>['retry','blocked'].includes(item.status))}
 <form method="POST" action="?/retryMonthly" use:enhance><button>Erneut prüfen</button></form>
 {/if}

	{#if status.error}<p role="alert">{status.error}</p>{/if}
	{#if !status.configured}<p class="notice">Kontozuordnung und Formatprofil müssen einmalig eingerichtet werden. Bank-PDFs benötigen zuerst einen geprüften Referenzauszug.</p>{/if}
	{#if status.files.length}
		<form method="POST" action="?/previewStatement" use:enhance>
			<label>Datei<select name="selection" aria-label="Datei" bind:value={selection} onchange={() => { account = ''; profile = ''; }}><option value="">Auswählen …</option>{#each status.files as file}<option value={file.id}>{file.label} · {file.name}</option>{/each}</select></label>
			<input type="hidden" name="sha256" value={selected?.sha256 ?? ''} />
			<label>Konto<select name="account" aria-label="Konto" bind:value={account} onchange={() => { profile = ''; }}><option value="">Zugeordnetes Konto …</option>{#each selected?.accounts ?? [] as a}<option value={a.ref}>{a.label} · {a.version}</option>{/each}</select></label>
			<label>Format<select name="profile" aria-label="Format" bind:value={profile}><option value="">Geprüftes Profil …</option>{#each registered?.profiles ?? [] as p}<option value={p}>{p === 'sparkasse-pdf-v1' ? 'Sparkasse · PDF' : p === 'postfinance-pdf-v1' ? 'PostFinance · PDF' : p === 'camt.053-v1' ? 'Kontoexport · CAMT' : 'Kontoexport · CSV'}</option>{/each}</select></label>
			<button type="submit" disabled={!status.scanner.configured || !!(job&&['queued','running'].includes(job.status)) || !selected || !registered || !profile}>Prüfen</button>
		</form>
		{#if selected?.kind === 'pdf' && !registered?.profiles.some(p => p.endsWith('-pdf-v1'))}<p class="notice">Für dieses Konto ist noch kein geprüftes PDF-Profil eingerichtet.</p>{/if}
	{:else}<small>Noch kein neuer Export im Finanz-Eingang.</small>{/if}
	{#if status.coverage.length}
		<div class="coverage"><h3>Eingelesene Auszüge</h3>{#each status.coverage as row}<div class="coverage-row"><strong>{row.account} · {row.currency}</strong><span>{row.from ?? 'Zeitraum offen'} — {row.to ?? 'offen'}</span><span>{row.count} Bewegungen · {row.complete ? 'Salden abgeglichen' : 'Prüfung offen'}</span>{#if row.issues.length}<small>{row.issues.join(' · ')}</small>{/if}<details class="movements"><summary>Bewegungen ansehen ({row.count})</summary>{#each row.entries as entry}<div class="movement"><span>{entry.date}</span><strong class:credit={entry.direction === 'credit'}>{money(entry.amount, entry.currency)}</strong><p>{entry.counterparty ? `${entry.counterparty} · ` : ''}{entry.purpose}</p><small>{entry.locator}</small></div>{/each}{#if row.entries.length < row.count}<small>Die ersten {row.entries.length} Bewegungen dieses Auszugs.</small>{/if}</details></div>{/each}</div>
	{/if}
	{#if status.reconciliations.length}<div class="coverage"><h3>Zahlungsabgleich</h3>{#each status.reconciliations as result}<div class="coverage-row"><strong>{result.confirmed ? 'Systembestätigter Nachweis' : result.stale ? 'Abgleich veraltet' : result.status === 'ambiguous' ? 'Zuordnung unklar' : 'Noch kein Zahlungsnachweis'}</strong><span>{result.subject}</span><small>{result.confirmed ? `${result.evidenceCount} Belege zugeordnet` : 'Zahlungsweg, Referenz und abgedeckten Zeitraum prüfen.'}</small></div>{/each}</div>{/if}
	{#if status.attempt}
		{@const attempt = status.attempt}
		<div class="receipt"><strong>{attempt.status === 'staged_unbooked' ? 'Vorschau bereit · ungebucht' : 'Angehalten'}</strong>{#if attempt.status !== 'staged_unbooked'}<span>{attempt.reason_code}</span>{/if}
			{#if attempt.preview?.preview}<span>{attempt.preview.preview.source_count} Quellen · {attempt.preview.preview.transaction_count} Bewegungen · {attempt.preview.preview.complete_sources} vollständig abgeglichene Quellen</span>{/if}
			{#each attempt.preview?.issues ?? [] as issue}<span>{issue}</span>{/each}
		</div>
	{/if}
	{#if status.warnings.length}<details><summary>Hinweise ({status.warnings.length})</summary>{#each status.warnings as warning}<p>{warning}</p>{/each}</details>{/if}
</section>

<style>
	.manual-import{margin:20px 0;padding:22px;border:1px solid var(--color-border);border-radius:16px;background:var(--color-background)}header{display:flex;justify-content:space-between;gap:16px;align-items:center}.coverage{margin-top:20px}.coverage h3{font-size:15px}.coverage-row{display:grid;gap:4px;padding:12px 0;border-top:1px solid var(--color-border);font-size:13px}header span{font:700 10px/1.4 ui-monospace,monospace;letter-spacing:.12em;color:#287b78}h2{margin:6px 0;font-size:20px}p,small{font-size:12px;color:var(--color-muted-foreground);line-height:1.5}form{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-top:16px}label{display:grid;gap:6px;font-size:12px;flex:1;min-width:180px}select{min-width:0;width:100%;box-sizing:border-box}.movement{display:grid;grid-template-columns:1fr auto;gap:4px;padding:12px 0;border-bottom:1px solid var(--color-border)}.movement p,.movement small{grid-column:1/-1;margin:0;overflow-wrap:anywhere}.movement .credit{color:#287b78}select,button{border:1px solid var(--color-border);border-radius:9px;padding:10px;font:inherit;background:var(--color-background);color:var(--color-foreground)}button{background:#287b78;color:white;font-weight:700;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.notice{padding:10px;background:#fff7eb;border-radius:9px;color:#87642f}.receipt{display:grid;gap:6px;padding:12px;margin-top:14px;background:#eef6f5;border-radius:10px;font-size:12px}.receipt span{color:#4e6d72}details{margin-top:12px;font-size:12px}summary{cursor:pointer}@media(max-width:600px){header{align-items:start;flex-direction:column}form{flex-direction:column;align-items:stretch}label{min-width:0}}
</style>
