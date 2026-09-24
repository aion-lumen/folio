<script lang="ts">
	import FinanceRun from '$lib/components/ledger/FinanceRun.svelte';
	import PaymentConfirmations from '$lib/components/ledger/PaymentConfirmations.svelte';
	import ManualStatementImport from '$lib/components/ledger/ManualStatementImport.svelte';
	import { AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpenCheck, BrainCircuit, CalendarRange, CheckCircle2, CircleDollarSign, Database, Inbox, Landmark, RefreshCw, Search, ShieldCheck } from 'lucide-svelte';

	let { data, form } = $props();
	let search = $state('');
	let currentIntake = $derived(
		data.intake.status !== null &&
		data.intake.sourceBatchId !== null &&
		data.intake.sourceBatchId === data.observations.batchId
	);
	let direction = $state<'all' | 'debit' | 'credit' | 'zero'>('all');

	const entries = $derived(
		(data.books.batch?.entries ?? []).filter((entry) => {
			if (direction !== 'all' && entry.direction !== direction) return false;
			const needle = search.trim().toLocaleLowerCase('de-CH');
			if (!needle) return true;
			return [entry.counterparty, entry.purpose, entry.transaction_type, ...entry.references]
				.filter(Boolean)
				.some((value) => value!.toLocaleLowerCase('de-CH').includes(needle));
		})
	);

	function date(value: string | null): string {
		if (!value) return '–';
		return new Date(`${value}T12:00:00`).toLocaleDateString('de-CH', {
			day: '2-digit', month: 'short', year: 'numeric'
		});
	}

	function timestamp(value: string): string {
		return new Date(value).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' });
	}

	function money(value: string, currency: string): string {
		return new Intl.NumberFormat('de-CH', { style: 'currency', currency }).format(Number(value));
	}
</script>

<svelte:head>
	<title>Folio · Ledger Books</title>
	<meta name="description" content="Privater, noch nicht gebuchter Prüfpfad für lokale Kontoexporte." />
</svelte:head>

<main class="books-page">
	<nav style="display:flex;gap:20px;margin-bottom:25px;font-size:14px"><a href="/ledger/wealth" style="color:#4a73a7;text-decoration:none">← Vermögen</a><strong>Belege & Abgleich</strong><a href="/ledger/contracts">Abos & Fixkosten</a></nav>
	<header class="hero">
		<div class="eyebrow"><Landmark size={16} /> LEDGER · BOOKS</div>
		<h1>Was finanziell wirklich passiert ist.</h1>
		<p>Bestätigtes Folio-Wissen und lokale Kontoexporte treffen hier als belegte Beobachtungen zusammen. Noch ist nichts gebucht, kategorisiert oder an eine Strategie-Session weitergegeben.</p>
	</header>
	<PaymentConfirmations payments={data.paymentConfirmed}/>
	<FinanceRun run={data.financeRun}/>
	<ManualStatementImport status={data.manualImport} />

	<section class="memory-exchange">
		<div class="exchange-copy">
			<span class="section-label"><BrainCircuit size={16} /> FOLIO-WISSEN → LEDGER</span>
			<h2>{data.observations.eligibleFacts} bestätigte Finanzfakten</h2>
			<p>Mail und Datei verwenden denselben privaten Beobachtungsvertrag. Konsolidierte Ableitungen und unbestätigte Vorschläge bleiben draussen.</p>
			<div class="exchange-flow">
				<div class:complete={data.observations.stagedObservations > 0} class="exchange-step">
					<span class="step-icon"><Inbox size={18} /></span>
					<div><small>FOLIO BEREITGESTELLT</small><strong>{data.observations.stagedObservations} Beobachtungen</strong>{#if data.observations.generatedAt}<span>{timestamp(data.observations.generatedAt)}</span>{/if}</div>
				</div>
				<ArrowRight class="flow-arrow" size={20} />
				<div class:complete={currentIntake} class="exchange-step">
					<span class="step-icon">{#if currentIntake}<CheckCircle2 size={18} />{:else}<Inbox size={18} />{/if}</span>
					<div><small>{currentIntake ? 'LEDGER EINGELESEN' : 'LEDGER AUSSTEHEND'}</small><strong>{currentIntake ? `${data.intake.acceptedObservations} bestätigt · ${data.intake.pendingReview} offen` : 'Aktueller Stapel fehlt'}</strong>{#if currentIntake && data.intake.receivedAt}<span>{timestamp(data.intake.receivedAt)} · Beobachtungen, noch keine Buchungen</span>{:else if data.intake.status}<span>Voriger Eingang ist nicht dieser Stapel</span>{:else}<span>Noch keine lokale Quittung</span>{/if}</div>
				</div>
			</div>
			{#if currentIntake}<div class="exchange-meta"><span>verworfen: {data.intake.rejectedObservations}</span><span>Rückfragen: {data.intake.needsClarification}</span>{#each data.intake.byType as item}<span>{item.type}: {item.count}</span>{/each}</div>{/if}
			{#if data.observations.error}<p class="exchange-error">{data.observations.error}</p>{/if}
			{#if data.intake.error}<p class="exchange-error">{data.intake.error}</p>{/if}
		</div>
		<form method="POST" action="?/syncObservations">
			<button type="submit" disabled={!data.observations.pathAvailable || data.observations.eligibleFacts === 0}>
				<RefreshCw size={18} /> Für Ledger synchronisieren
			</button>
		</form>
	</section>
	{#if form?.message}<p class:success={form.success} class="form-message" role="status">{form.message}</p>{/if}

	{#if !data.books.available || !data.books.batch}
		<section class="empty"><Database size={28} /><h2>Noch kein prüfbarer Stapel</h2><p>{data.books.error}</p></section>
	{:else}
		{@const batch = data.books.batch}
		<section class="status-strip">
			<div class="status"><ShieldCheck size={20} /><span><strong>Nur ansehen</strong><small>ledger.db blieb unangetastet</small></span></div>
			<div class="status"><BookOpenCheck size={20} /><span><strong>{batch.coverage.transaction_count} Buchungen</strong><small>noch nicht übernommen</small></span></div>
			<div class="status"><CalendarRange size={20} /><span><strong>{date(batch.coverage.booking_date_from)} – {date(batch.coverage.booking_date_to)}</strong><small>aus {batch.coverage.sources.length} Exporten</small></span></div>
		</section>

		<section class="account-card">
			<div><span class="section-label">TESTKONTO</span><h2>{batch.account.label}</h2><p>{batch.account.owner_context}</p></div>
			<span class="stage">ungeprüft · ungebucht</span>
		</section>

		{#if batch.coverage.uncovered_intervals.length}
			<section class="gap" role="status">
				<AlertTriangle size={22} />
				<div><strong>Die Exporte bilden keinen lückenlosen Verlauf.</strong>
					{#each batch.coverage.uncovered_intervals as interval}
						<p>{date(interval.from)} bis {date(interval.to)}: {interval.days} Tage ohne vorliegenden Export.</p>
					{/each}
				</div>
			</section>
		{/if}

		<section class="overview-grid">
			<div class="coverage-card">
				<span class="section-label">QUELLEN & ABDECKUNG</span>
				{#each batch.coverage.sources as source}
					<div class="source-row"><div><strong>{source.role === 'current' ? 'Aktueller Export' : 'Historischer Export'}</strong><small>{date(source.booking_date_from)} – {date(source.booking_date_to)}</small></div><b>{source.row_count}</b></div>
				{/each}
				<div class="dedupe"><span>{batch.coverage.row_count_before_deduplication} Quellzeilen</span><span>{batch.coverage.duplicate_count} exportübergreifende Dubletten</span></div>
			</div>
			<div class="totals-card">
				<span class="section-label">RECHNERISCHER QUERSCHNITT</span>
				{#each batch.totals as total}
					<div class="total-main"><CircleDollarSign size={24} /><div><strong>{money(total.net, total.currency)}</strong><small>Netto im vorliegenden Zeitraum</small></div></div>
					<div class="total-lines"><span><ArrowDownLeft size={16} /> Eingänge {money(total.credits, total.currency)} · {total.credit_count}</span><span><ArrowUpRight size={16} /> Ausgänge {money(total.debits, total.currency)} · {total.debit_count}</span></div>
				{/each}
			</div>
		</section>

		<section class="transactions">
			<div class="section-head"><div><span class="section-label">PRÜFSTAPEL</span><h2>Buchungen einzeln ansehen</h2></div><small>erstellt {timestamp(batch.generated_at)}</small></div>
			<div class="filters">
				<label><Search size={17} /><input bind:value={search} placeholder="Empfänger, Zweck oder Referenz suchen" /></label>
				<select bind:value={direction} aria-label="Buchungsrichtung"><option value="all">Alle Richtungen</option><option value="debit">Ausgänge</option><option value="credit">Eingänge</option><option value="zero">Nullbuchungen</option></select>
			</div>
			<div class="entry-count">{entries.length} von {batch.entries.length} sichtbar</div>
			<div class="entry-list">
				{#each entries as entry (entry.entry_id)}
					<details class="entry">
						<summary>
							<span class:credit={entry.direction === 'credit'} class:debit={entry.direction === 'debit'} class="direction-icon">{#if entry.direction === 'credit'}<ArrowDownLeft size={17} />{:else}<ArrowUpRight size={17} />{/if}</span>
							<span class="entry-main"><strong>{entry.counterparty ?? entry.transaction_type ?? 'Ohne Gegenpartei'}</strong><small>{entry.purpose ?? entry.transaction_type ?? 'Kein Buchungstext'}</small></span>
							<span class="entry-date">{date(entry.booking_date)}</span>
							<b class:positive={entry.direction === 'credit'}>{money(entry.amount, entry.currency)}</b>
						</summary>
						<div class="entry-details"><div><span>Typ</span><strong>{entry.transaction_type ?? '–'}</strong></div><div><span>Status</span><strong>{entry.status ?? '–'}</strong></div><div><span>Gegenkonto</span><strong>{entry.counterparty_account_hint ?? '–'}</strong></div><div><span>Wertstellung</span><strong>{date(entry.value_date)}</strong></div>{#if entry.references.length}<div class="references"><span>Referenzen</span><strong>{entry.references.join(' · ')}</strong></div>{/if}<div><span>Quellen</span><strong>{entry.source_ids.length}</strong></div></div>
					</details>
				{/each}
			</div>
		</section>
	{/if}
</main>

<style>
	.books-page { max-width: 1480px; margin: 0 auto; padding: clamp(24px, 4vw, 64px); color: var(--color-foreground); }
	.hero { max-width: 900px; margin-bottom: 32px; }
	.eyebrow,.section-label { display:flex; align-items:center; gap:8px; color:#267c7e; font:700 12px/1.2 ui-monospace,monospace; letter-spacing:.16em; }
	h1 { margin:12px 0; font-size:clamp(36px,5vw,68px); line-height:1.02; letter-spacing:-.045em; font-weight:500; }
	.hero p { color:#63738e; font-size:19px; line-height:1.55; max-width:820px; }
	.memory-exchange { display:flex; align-items:center; justify-content:space-between; gap:28px; padding:26px 28px; margin-bottom:20px; border:1px solid #cfe2e1; border-left:5px solid #2d8586; border-radius:18px; background:#f7fbfa; }
	.exchange-copy h2 { margin:8px 0 5px; font-size:25px; }.exchange-copy>p{margin:0;color:#687890;max-width:760px;line-height:1.5}.exchange-flow{display:flex;align-items:center;gap:12px;margin-top:18px}.exchange-step{display:flex;align-items:center;gap:10px;min-width:210px;padding:12px 14px;border:1px solid #dbe5e8;border-radius:13px;background:#fff;color:#75839a}.exchange-step.complete{border-color:#b9dcd6;background:#f2faf7;color:#287a75}.exchange-step>div{display:flex;flex-direction:column;gap:2px}.exchange-step small{font:700 10px/1.2 ui-monospace,monospace;letter-spacing:.11em}.exchange-step strong{color:#1d2c40}.exchange-step span{font-size:12px}.step-icon{display:grid;place-items:center;flex:0 0 32px;height:32px;border-radius:50%;background:#e9eff2}.complete .step-icon{background:#d9eee9}:global(.flow-arrow){color:#91a0af}.exchange-meta{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:12px;color:#65758c;font-size:13px}.exchange-error{color:#a13f37!important;margin-top:10px!important}.memory-exchange form{flex:0 0 auto}.memory-exchange button{display:flex;align-items:center;gap:9px;border:0;border-radius:12px;background:#2c8282;color:#fff;font:700 15px/1.2 inherit;padding:14px 18px;cursor:pointer}.memory-exchange button:disabled{opacity:.45;cursor:not-allowed}.form-message{margin:-6px 0 20px;padding:13px 16px;border-radius:12px;background:#fff1ee;color:#a13f37}.form-message.success{background:#eaf6f2;color:#25745f}
	.status-strip { display:grid; grid-template-columns:repeat(3,1fr); border:1px solid #dce5ed; border-radius:18px; background:#fff; margin-bottom:20px; }
	.status { display:flex; gap:12px; align-items:center; padding:20px 24px; color:#287f7f; }
	.status + .status { border-left:1px solid #e3e9ef; }
	.status span { display:flex; flex-direction:column; gap:3px; } .status strong{color:#122037}.status small{color:#72819a}
	.account-card { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; padding:28px; border:1px solid #dbe4eb; border-left:5px solid #2d8586; border-radius:18px; background:#fbfdfd; }
	.account-card h2 { margin:8px 0 4px; font-size:28px; }.account-card p{margin:0;color:#667691}.stage{padding:8px 12px;border-radius:999px;background:#e7f4f2;color:#287a75;font-weight:700;font-size:13px}
	.gap { display:flex; gap:14px; margin:20px 0; padding:20px 22px; border-radius:16px; border:1px solid #f1c47f; background:#fff8ec; color:#955d16; }.gap p{margin:4px 0 0;color:#7c684f}
	.overview-grid { display:grid; grid-template-columns:1.1fr .9fr; gap:20px; margin:20px 0; }
	.coverage-card,.totals-card,.transactions,.empty { border:1px solid #dce5ed; border-radius:18px; background:#fff; padding:26px; }
	.source-row { display:flex; justify-content:space-between; align-items:center; padding:18px 0; border-bottom:1px solid #e7edf2; }.source-row div{display:flex;flex-direction:column;gap:4px}.source-row small,.dedupe,.totals-card small{color:#73819a}.source-row b{font-size:24px;color:#287f7f}.dedupe{display:flex;justify-content:space-between;padding-top:16px;font-size:13px}
	.total-main { display:flex; gap:14px; align-items:center; margin:25px 0; color:#287f7f}.total-main div{display:flex;flex-direction:column}.total-main strong{font-size:34px;color:#122037}.total-lines{display:grid;gap:10px;color:#687890}.total-lines span{display:flex;gap:8px;align-items:center}
	.transactions { margin-top:20px; }.section-head{display:flex;justify-content:space-between;align-items:end;gap:20px}.section-head h2{margin:7px 0 0}.section-head small{color:#75839a}
	.filters { display:grid;grid-template-columns:1fr 220px;gap:12px;margin:24px 0 8px}.filters label{display:flex;align-items:center;gap:10px;border:1px solid #d7e1e9;border-radius:12px;padding:0 14px;color:#73839b}.filters input,.filters select{font:inherit}.filters input{width:100%;border:0;outline:0;padding:13px 0;background:transparent}.filters select{border:1px solid #d7e1e9;border-radius:12px;background:#fff;padding:0 14px}.entry-count{font-size:13px;color:#75839a;margin:10px 0}
	.entry-list{border:1px solid #e1e8ee;border-radius:14px;overflow:hidden}.entry + .entry{border-top:1px solid #e3e9ee}.entry summary{list-style:none;display:grid;grid-template-columns:36px minmax(0,1fr) 125px 135px;gap:14px;align-items:center;padding:17px 18px;cursor:pointer}.entry summary::-webkit-details-marker{display:none}.direction-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#fce9e7;color:#b74b40}.direction-icon.credit{background:#e3f4ee;color:#247860}.entry-main{display:flex;min-width:0;flex-direction:column;gap:4px}.entry-main small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6b7b92}.entry-date{color:#65758c}.entry summary>b{text-align:right;color:#b34a42}.entry summary>b.positive{color:#247860}.entry-details{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:18px 66px;background:#f7fafb;border-top:1px solid #e3e9ee}.entry-details div{display:flex;flex-direction:column;gap:4px}.entry-details span{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#75849a}.entry-details strong{font-size:13px;overflow-wrap:anywhere}.entry-details .references{grid-column:span 3}
	.empty{text-align:center;padding:70px;color:#6d7b91}.empty :global(svg){color:#2d8586}.empty h2{color:#172238}
	@media(max-width:800px){.memory-exchange{align-items:flex-start;flex-direction:column}.memory-exchange form,.memory-exchange button{width:100%;justify-content:center}.exchange-flow{align-items:stretch;flex-direction:column;width:100%}.exchange-step{min-width:0}:global(.flow-arrow){align-self:center;transform:rotate(90deg)}.status-strip,.overview-grid{grid-template-columns:1fr}.status + .status{border-left:0;border-top:1px solid #e3e9ef}.filters{grid-template-columns:1fr}.entry summary{grid-template-columns:32px minmax(0,1fr) 110px}.entry-date{display:none}.entry-details{grid-template-columns:1fr 1fr;padding:16px}.entry-details .references{grid-column:span 2}.account-card{flex-direction:column}.books-page{padding:22px 16px}}
</style>
