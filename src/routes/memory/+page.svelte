<script lang="ts">
	import PaymentConfirmations from '$lib/components/ledger/PaymentConfirmations.svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { memoryFormAction } from '$lib/memory/form-action.js';
	import { ArrowRight, Brain, Check, Database, FileSearch, Files, LoaderCircle, MoonStar, Network, Plus, ShieldCheck, Trash2, Wrench, X } from 'lucide-svelte';

	let { data, form } = $props();
	let addOpen = $state(false);
	let nightShiftRunning = $state(false);
	const domainLabels: Record<string, string> = {
		ai: 'AI & Wissen', career: 'Karriere', personal: 'Persönlich', finance: 'Finanzen', health: 'Gesundheit',
		property: 'Immobilien', mobility: 'Mobilität', household: 'Haushalt', systems: 'Systeme', data_analytics: 'Daten & Analytics', undetermined: 'Ungeklärt'
	};
	const classLabels: Record<string, string> = {
		product_fact: 'Produktfakt', profile: 'Profil', preference: 'Präferenz', voice_rule: 'Sprachregel',
		voice_example: 'Schreibbeispiel', decision: 'Entscheidung', context: 'Kontext',
		transaction: 'Transaktion', account_reference: 'Kontoreferenz', application: 'Bewerbung', appointment: 'Termin',
		availability: 'Verfügbarkeit', commitment: 'Zusage', contact_fact: 'Kontakt', project_fact: 'Projektfakt'
	};
	const reasonLabels: Record<string, string> = { evidence_mismatch: 'Beleg passt nicht zur Aussage', restricted_personal_identifier: 'Persönliche Kennnummer gehört nicht ins Gedächtnis', wrong_attribution: 'Person oder Vorgang falsch zugeordnet', template_or_general_terms: 'Muster oder allgemeine Bedingungen', historical_context_missing: 'Zeitraum oder Bedingungen fehlen', overinterpretation: 'Aussage geht über den Beleg hinaus', wrong_sensitivity: 'Vertraulichkeit nicht ausreichend', wrong_domain: 'Domäne muss geklärt werden', date_not_explicit: 'Datum nicht ausdrücklich belegt', status_not_explicit: 'Status nicht ausdrücklich belegt', identity_not_explicit: 'Zuordnung nicht eindeutig', bundle_internal_conflict: 'Widerspruch im Vorschlag', transient_or_low_value: 'Dauerhafter Nutzen nicht ausreichend belegt' };
	const sensitivityLabels = { public: 'öffentlich', private: 'privat', sensitive: 'sensibel' } as const;
	const applicationStatusLabels: Record<string, string> = {
		submitted: 'eingereicht', received: 'eingegangen', under_review: 'wird geprüft',
		interview: 'Gespräch', rejected: 'Absage', withdrawn: 'zurückgezogen', offer: 'Angebot'
	};
	const predicateLabels: Record<string, string> = {
		has_role: 'Stelle', has_application_status: 'Status', received_at: 'Eingang', mail_received_at: 'Mail erhalten',
		has_contact_address: 'Kontakt', paid: 'Zahlung', identified_by: 'Referenz',
		available_at: 'Verfügbarkeit', committed_to: 'Zusage', scheduled_for: 'Termin',
		contacted_by: 'Kontakt', decided: 'Entscheidung', has_context: 'Kontext',
		has_profile_fact: 'Profil', has_project_fact: 'Projekt', prefers: 'Präferenz'
	};
	const relationLabels: Record<string, string> = {
		application_at: 'beworben bei', contact_for: 'Kontakt für'
	};
	type BundleFact = {
		fact_id: string; domain: string; data_class: string; sensitivity: keyof typeof sensitivityLabels; status?: string;
		subject: string; predicate: string; value_text: string; source_excerpt: string | null; valid_from: string | null;
	};
	type BundleView = {
		entities: Array<{ entity_id: string; entity_type: string; canonical_label: string }>;
		facts: BundleFact[];
		episodes: Array<{ title: string; status?: string }>;
	};
	type SourceView = {
		source_id: string; title: string; relative_path: string | null; source_kind: string;
		status: 'candidate' | 'confirmed' | 'rejected' | 'tombstoned'; updated_at: string;
		domains: Array<{ domain: string; role: 'primary' | 'secondary' }>;
	};
	const domains = $derived([...new Set(['ai', 'career', 'personal', ...data.overview.domains.map((item) => item.domain)])]);
	const sourceGroups = $derived(groupSources(data.sources as SourceView[]));
	const dossierFactIds = $derived(new Set(data.dossiers.flatMap((dossier) => dossier.facts.map((fact) => fact.fact_id))));
	const standaloneConfirmed = $derived(data.confirmed.filter((fact) => !dossierFactIds.has(fact.fact_id)));
	const nextBundle = $derived(data.candidateBundles[0]);
	const nextGroup = $derived(data.candidateGroups[0]);
	const historicalFactIds = $derived(new Set(data.historicalFactIds));

	function label(map: Record<string, string>, value: string): string {
		return map[value] ?? value.replaceAll('_', ' ');
	}

	function sourceLabel(kind: string): string {
		if (kind === 'owner') return 'von dir';
		if (kind === 'mail') return 'aus Mail';
		if (kind === 'attachment') return 'aus PDF-Anhang';
		if (kind === 'sonar') return 'aus Sonar';
		return kind;
	}

	function formatDate(value: string): string {
		return new Date(value).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function factValue(fact: { predicate: string; value?: string; value_text?: string }): string {
		const value = fact.value ?? fact.value_text ?? '';
		if (fact.predicate === 'has_application_status') return applicationStatusLabels[value] ?? value;
		if (['received_at','mail_received_at'].includes(fact.predicate) && /^\d{4}-\d{2}-\d{2}/u.test(value)) return formatDate(value);
		return value;
	}

	function bundleTitle(bundle: BundleView): string {
		return bundle.entities.find((entity) => entity.entity_type === 'application')?.canonical_label
			?? bundle.facts.find((fact) => fact.data_class === 'transaction' && fact.status !== 'superseded')?.subject
			?? bundle.episodes.find((episode) => episode.status !== 'rejected')?.title
			?? bundle.entities[0]?.canonical_label
			?? bundle.facts[0]?.subject
			?? 'Neues Wissen';
	}

	function factHint(fact: BundleFact, title: string): string | null {
		const subject = fact.subject.trim();
		return subject && subject !== title && subject !== factValue(fact) ? subject : null;
	}

	function evidenceItems(bundle: BundleView): Array<{ excerpt: string; labels: string[] }> {
		const grouped = new Map<string, Set<string>>();
		for (const fact of bundle.facts.filter((fact) => fact.status !== 'superseded' && fact.status !== 'rejected')) {
			const excerpt = fact.source_excerpt?.trim();
			if (!excerpt) continue;
			const labels = grouped.get(excerpt) ?? new Set<string>();
			labels.add(label(predicateLabels, fact.predicate));
			grouped.set(excerpt, labels);
		}
		return [...grouped].map(([excerpt, labels]) => ({ excerpt, labels: [...labels] }));
	}

	function entityLabel(bundle: { entities: Array<{ entity_id: string; canonical_label: string }> }, entityId: string): string {
		return bundle.entities.find((entity) => entity.entity_id === entityId)?.canonical_label ?? 'Unbekannte Entität';
	}

	function dossierSummaryFacts(dossier: { facts: BundleFact[] }): BundleFact[] {
		return dossier.facts.filter((fact) => fact.predicate !== 'has_role');
	}

	function consolidationChangeCount(bundle: { report: { duplicate_groups: Array<{ fact_ids: string[] }>; entity_link_candidates: Array<{ fact_ids: string[] }>; semantic_context_drafts: unknown[] } }): number {
		return bundle.report.duplicate_groups.reduce((sum, group) => sum + Math.max(0, group.fact_ids.length - 1), 0)
			+ bundle.report.entity_link_candidates.reduce((sum, candidate) => sum + candidate.fact_ids.length, 0)
			+ bundle.report.semantic_context_drafts.length;
	}

	function groupSources(sources: SourceView[]): Array<{ domain: string; sources: SourceView[] }> {
		const groups = new Map<string, SourceView[]>();
		for (const source of sources) {
			const primary = source.domains.find((item) => item.role === 'primary')?.domain ?? 'undetermined';
			groups.set(primary, [...(groups.get(primary) ?? []), source]);
		}
		return [...groups].map(([domain, grouped]) => ({ domain, sources: grouped }))
			.sort((left, right) => right.sources.length - left.sources.length || label(domainLabels, left.domain).localeCompare(label(domainLabels, right.domain), 'de'));
	}
</script>

<svelte:head>
	<title>Folio · Gedächtnis</title>
	<meta name="description" content="Bestätigtes Folio-Wissen mit Quellen und kontrollierter Kontextausgabe." />
</svelte:head>

<div class="memory-page">
	<header class="hero">
		<div class="eyebrow"><Brain size={16} /> FOLIO-GEDÄCHTNIS</div>
		<div class="hero-row">
			<div>
				<h1>Was weiss Folio?</h1>
				<p>Bestätigtes Wissen finden oder die nächste sinnvolle Änderung freigeben.</p>
			</div>
			<div class="hero-actions"><a class="secondary" href="/memory/changes"><Wrench size={17} /> Fakt berichtigen</a><button class="primary" type="button" onclick={() => (addOpen = !addOpen)}><Plus size={17} /> Wissen ergänzen</button></div>
		</div>
	</header>
	<nav class="memory-tabs" aria-label="Gedächtnisbereiche"><a class:active={data.memoryView==='overview'} href="/memory">Überblick</a><a class:active={data.memoryView==='review'} href="/memory?view=review">Deine Entscheidung <span>{data.workCounts.decision}</span></a><a class:active={data.memoryView==='processing'} href="/memory?view=processing">Vorbereitung & Warten <span>{data.workCounts.processing}</span></a><a class:active={data.memoryView==='automatic'} href="/memory?view=automatic">Automatisch erledigt <span>{data.automaticCount}</span></a><a class:active={data.memoryView==='history'} href="/memory?view=history">Historie <span>{data.historyCount}</span></a><a class:active={data.memoryView==='knowledge'} href="/memory?view=knowledge">Wissen</a><a class:active={data.memoryView==='maintenance'} href="/memory?view=maintenance">Wartung</a><a href="/memory/graph">Graph</a></nav>

 {#if data.retentionGroups.length}
  <section class="source-groups">
   <div class="section-heading"><div><h2>{data.memoryView==='automatic'?'Aussortierte Gedächtnisvorschläge':'Suchprofile und frühere Absprachen'}</h2><p>{data.memoryView==='automatic'?'Die Originalmails bleiben erhalten.':'Nach Quellen gebündelt, mit ihrem damaligen Stand.'}</p></div></div>
   {#each data.retentionGroups as group (group.key)}
    <article class="source-group">
     <header class="group-head"><div><span class="group-eyebrow">{group.mode==='profile'?'SUCHPROFIL':group.mode==='history'?'HISTORIE':'AUSSORTIERT'}</span><h3>{group.title}</h3><p>{group.reason}</p></div><small>{group.entries.length} {group.entries.length===1?'Quelle':'Quellen'}{#if group.from}<br/>{formatDate(group.from)}{#if group.to!==group.from} – {formatDate(group.to!)}{/if}{/if}</small></header>
     <details class="bundle-detail"><summary>Quellen und Angaben ansehen</summary>
      {#each group.entries as entry (entry.proposal_id)}
       <div class="work-note"><small>{entry.source_ref} · {entry.source_date?formatDate(entry.source_date):'Datum unbekannt'}</small>
        {#each entry.facts as fact}<p>{fact.subject}: {fact.value}</p>{/each}
        <form method="POST" action={memoryFormAction(page.url.search,'restoreRetention')} use:enhance><input type="hidden" name="proposal_id" value={entry.proposal_id}/><button type="submit" class="ghost">Wieder prüfen</button></form>
       </div>
      {/each}
     </details>
    </article>
   {/each}
  </section>
 {/if}

	{#if data.memoryView==='automatic'}
  {#if data.duplicateImports.length}
   <section class="view-intro"><div><h2>Zusammengeführte Doppelimporte</h2></div></section>
   {#each data.duplicateImports as item (item.proposal_id)}
    <article class="work-note"><strong>{item.title}</strong><p>Vollständigen Import behalten · {formatDate(item.recorded_at)}</p>
     <details><summary>Nachweis ansehen</summary><p>Doppelimport: {item.source_ref}</p><p>Behaltene Quelle: {item.canonical_source ?? 'Quelle nicht verfügbar'}</p>
      {#if item.canonical_status==='candidate'}<a href={'/memory?view=review&proposal='+encodeURIComponent(item.canonical_id)}>Behaltenen Fall ansehen →</a>
      {:else if item.canonical_status==='confirmed'}<a href="/memory?view=knowledge">Bestätigtes Wissen ansehen →</a>{/if}
     </details>
    </article>
   {/each}
  {/if}
  {#if data.applicationEvidence.length}
   <section class="view-intro"><div><h2>Belegte Bewerbungen</h2><p>Dokumente und zugehörige Mails zusammengeführt.</p></div></section>
   {#each data.applicationEvidence as item (item.proposal_id)}
    <article class="work-note"><strong>{item.title}</strong><p>Automatisch abgeglichen · {formatDate(item.reviewed_at)}</p>
     <details><summary>Nachweis ansehen</summary><p>Anschreiben vom {formatDate(item.document_date)}</p>
      {#each item.mails as mail}<p>Antwort vom {formatDate(mail.date)} · {mail.ref}</p><blockquote>{mail.quote}</blockquote>{/each}
      <p>{item.source_ref}</p>
     </details>
    </article>
   {/each}
  {/if}
		{#if data.careerConfirmed.length}
			<section class="view-intro"><div><h2>Abgeglichene Absagen</h2><p>Mit dem Tracker und der zugehörigen Mail abgeglichen.</p></div></section>
			{#each data.careerConfirmed as item (item.proposal_id)}
				<article class="work-note"><strong>{item.title}</strong><p>Absage übernommen · {formatDate(item.reviewed_at)}</p><details><summary>Nachweis ansehen</summary><p>{item.source_ref} · {item.basis==='tracker_rejected_history'?'Mit der Absagehistorie im Tracker abgeglichen':item.basis==='tracker_confirmed_same_mail'?'Im Tracker bereits für diese Mail bestätigt':'Exakte beworbene Stelle und eindeutige Absage'}</p><a href="/career">Tracker öffnen →</a></details></article>
			{/each}
		{/if}
		<section class="view-intro"><div><h2>Erledigte Zahlungsabgleiche</h2><p>Ledger hat diese Rechnungen mit den Kontoauszügen abgeglichen. Die Nachweise findest du beim jeweiligen Eintrag.</p></div></section>
		<PaymentConfirmations payments={data.paymentConfirmed}/>
		{#if !data.paymentConfirmed.length}<div class="empty"><strong>Noch keine automatischen Zahlungsabgleiche.</strong></div>{/if}
	{/if}
	{#if form?.message}
		<div class:success={form.success} class:error={!form.success} class="notice" role="status">{form.message}</div>
	{/if}
	{#if data.memoryView==='maintenance'}<section class="view-intro"><div><span>VERTRAUEN & WARTUNG</span><h2>Technische Pflege</h2><p>Quellen, Modellprüfungen und Konsolidierung bleiben vollständig verfügbar, ohne die tägliche Ansicht zu überladen.</p></div><div class="hero-actions"><a class="secondary" href="/memory/graph"><Files size={17}/> Wissensgraph</a></div></section>{/if}
	{#if data.memoryView==='knowledge'}<section class="view-intro"><div><span>BESTÄTIGTES WISSEN</span><h2>Dossiers und Einzelfakten</h2><p>Hier steht nur Wissen, das bereits bestätigt wurde.</p></div></section>{/if}

	{#if data.memoryView==='overview'}
	<section class="summary" aria-label="Memory-Status">
		<div><strong>{data.overview.confirmed}</strong><span>durch Freigabe bestätigt</span></div>
		<div><strong>{data.workCounts.decision}</strong><span>Vorgänge für deine Entscheidung</span><a href="/memory?view=processing">{data.workCounts.processing} in Vorbereitung oder wartend</a><a href="/memory?view=history">{data.historyCount} Einträge in der Historie</a></div>
		<div><strong>{data.overview.domains.length}</strong><span>aktive Domänen</span></div>
		<div class="principle"><ShieldCheck size={20} /><span><strong>Quelle bleibt sichtbar</strong><small>Modelle dürfen nichts still zur Wahrheit machen.</small></span></div>
	</section>
	<section class="next-action">
		<div><span>NÄCHSTE PRÜFUNG</span><h2>{nextBundle?bundleTitle(nextBundle):nextGroup?'Nächsten Beleg prüfen':'Keine Entscheidung offen'}</h2><p>{nextBundle?nextBundle.work.question:nextGroup?`${nextGroup.facts.length} Angaben aus einem Beleg warten auf deine Entscheidung.`:'Es wartet derzeit kein geladenes Prüfbündel.'}</p></div>
		{#if nextBundle}<a class="primary" href={`/memory?view=review#proposal-${nextBundle.proposal.proposal_id}`}>Jetzt prüfen <ArrowRight size={17}/></a>{:else if nextGroup}<a class="primary" href="/memory?view=review">Jetzt prüfen <ArrowRight size={17}/></a>{/if}
	</section>
	<section class="domain-overview"><div class="section-heading"><div><span>DOMÄNEN</span><h2>Eingeordneter Arbeitsvorrat</h2></div><strong class="count">{data.sourceCount}</strong></div><div class="domain-pills">{#each data.sourceDomainCounts as group}<span><strong>{label(domainLabels,group.domain)}</strong><small>{group.count}</small></span>{/each}</div></section>
	{/if}

	{#if data.memoryView==='maintenance' && data.sources.length}
		<section class="source-building">
			<div class="section-heading source-building-head">
				<div><span>QUELLEN IM AUFBAU</span><h2>Was Folio bereits eingeordnet hat.</h2><p>Diese Dateien sind einer oder mehreren Domänen zugeordnet. Sie sind Provenienz und Arbeitsvorrat – noch kein bestätigter Wissensinhalt.</p></div>
				<div class="source-building-actions"><strong class="count">{data.sources.length}</strong><a class="secondary" href="/memory/graph"><Network size={16} /> Im Graph ansehen</a></div>
			</div>
			<div class="source-domain-grid">
				{#each sourceGroups as group}
					<details class="source-domain" open={sourceGroups.length <= 4}>
						<summary><span><Files size={16} /> {label(domainLabels, group.domain)}</span><strong>{group.sources.length}</strong></summary>
						<div class="source-file-list">
							{#each group.sources as source}
								<div><span>{source.title}</span><small>{source.relative_path ?? source.source_kind}{source.domains.some((item) => item.role === 'secondary') ? ` · zusätzlich ${source.domains.filter((item) => item.role === 'secondary').map((item) => label(domainLabels, item.domain)).join(', ')}` : ''}</small></div>
							{/each}
						</div>
					</details>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.memoryView==='maintenance'}
	<section class="night-shift">
		<div class="night-shift-head">
			<div><span>NACHTSCHICHT</span><h2>Aufräumen, ohne Erinnerung umzuschreiben.</h2><p>Folio sucht exakte Dubletten, erkennt wiederkehrende Objektformen und baut die abgeleitete Suche neu auf. Eindeutige Referenzen bleiben erhalten.</p></div>
			<form method="POST" action={memoryFormAction(page.url.search, 'nightShift')} use:enhance={() => {
				nightShiftRunning = true;
				return async ({ update }) => {
					await update();
					nightShiftRunning = false;
				};
			}}><button class="secondary" type="submit" disabled={nightShiftRunning}>{#if nightShiftRunning}<span class="spin"><LoaderCircle size={17} /></span>{:else}<MoonStar size={17} />{/if}{nightShiftRunning ? 'Lokales Modell prüft …' : 'Nachtschicht starten'}</button></form>
		</div>
		{#if form?.nightShift}
			<div class="night-report">
				<div><strong>{form.nightShift.checked_facts}</strong><span>Fakten geprüft</span></div>
				<div><strong>{form.nightShift.duplicate_groups.length}</strong><span>echte Dublettengruppen</span></div>
				<div><strong>{form.nightShift.entity_link_candidates.length}</strong><span>Entitätsverbindungen</span></div>
				<div><strong>{form.nightShift.semantic_context_drafts.length + form.nightShift.derived_contexts.length}</strong><span>Kontextentwürfe</span></div>
			</div>
			{#if form.nightShift.duplicate_groups.length || form.nightShift.anchor_candidates.length || form.nightShift.entity_link_candidates.length || form.nightShift.derived_contexts.length}
				<div class="night-findings">
					{#each form.nightShift.duplicate_groups as group}
						<div><span>DUBLETTE · {label(domainLabels, group.domain)}</span><strong>{group.label}</strong><small>{group.fact_ids.length} identische Fakten aus {group.source_refs.length} Quellen. Noch nichts entfernt.</small></div>
					{/each}
					{#each form.nightShift.anchor_candidates as candidate}
						<div><span>ANKER-VORSCHLAG · {label(domainLabels, candidate.domain)}</span><strong>Zahlung · {candidate.label}</strong><small>{candidate.reason} Die Einzelfakten bleiben erhalten.</small></div>
					{/each}
					{#each form.nightShift.entity_link_candidates as candidate}
						<div><span>VERBINDUNG · {label(domainLabels, candidate.domain)}</span><strong>{candidate.entity_label}</strong><small>{candidate.reason} · {candidate.source_refs.length} Quellen</small></div>
					{/each}
					{#each form.nightShift.semantic_suggestions as suggestion}
						<div><span>SEMANTISCHER VORSCHLAG · {label(domainLabels, suggestion.domain)}</span><strong>{suggestion.title}</strong><small>{suggestion.reason} · {suggestion.fact_ids.length} belegte Fakten</small></div>
					{/each}
					{#each form.nightShift.semantic_context_drafts as context}
						<div><span>KONTEXTENTWURF · {label(domainLabels, context.domain)}</span><strong>{context.title}</strong><small>{context.summary} · {context.fact_ids.length} Fakten · {context.evidence?.origin_source_count ?? '—'} {context.evidence?.origin_source_count === 1 ? 'Ursprungsbeleg' : 'Ursprungsbelege'} (Unabhängigkeit nicht nachgewiesen)</small></div>
					{/each}
					{#each form.nightShift.derived_contexts.slice(0, 6) as context}
						<div><span>ABGELEITETER KONTEXT · {label(domainLabels, context.domain)}</span><strong>{context.title}</strong><small>{context.summary}</small></div>
					{/each}
				</div>
			{/if}
			<p class="night-note">Suchprojektion: {form.nightShift.rebuilt_index_entries} Einträge neu aufgebaut. Modellprüfung: {form.nightShift.semantic_status === 'completed' ? 'abgeschlossen' : form.nightShift.semantic_status === 'unavailable' ? 'nicht verfügbar' : 'übersprungen'}. Der Bericht selbst ist abgeleitet und keine neue Wahrheitsschicht.</p>
		{/if}
	</section>

	<section class="consolidation-review" aria-label="Quellenbestätigung">
		<div class="section-heading"><div><span>VIER-QUELLEN-REGEL · AKTIV</span><h2>Quellenbestätigt</h2><p>Mindestens vier geprüfte, unabhängige Ursprungsfamilien, dieselbe eindeutig zugeordnete Aussage und kein offener Widerspruch. Das ist keine persönliche Bestätigung und keine Freigabe für öffentliche Texte.</p></div><strong class="count">{data.sourceConfirmed.length}</strong></div>
		{#if data.sourceConfirmed.length}
			<div class="fact-list">{#each data.sourceConfirmed as claim}
				<article class="fact-card confirmed"><div class="fact-top"><span class="domain">QUELLENBESTÄTIGT</span><span>{claim.source_count} unabhängige Ursprungsfamilien</span><span>{sensitivityLabels[claim.sensitivity]}</span></div><h3>{claim.fact.subject}</h3><p>{claim.fact.value_text}</p><small>Für lokale Kontextausgabe verfügbar. Persönliche Freigabe bleibt getrennt.</small><details><summary>Belegkette · {claim.supporting_fact_ids.length} Fakten</summary><p>{claim.supporting_fact_ids.join(' · ')}</p></details></article>
			{/each}</div>
		{:else}
			<p>Noch keine Aussage erfüllt die Regel mit vollständiger Herkunftsprüfung. Unbekannte Ursprünge werden nicht als unabhängig angenommen.</p>
		{/if}
		{#if data.quorumStatus.eligible}<p>{data.quorumStatus.eligible} Aussagen sind für den nächsten Nachtschichtlauf ausreichend belegt.</p>{/if}
		<p>Bei neuen Widersprüchen, widerrufener Herkunft oder veränderten Belegen entfällt diese Einstufung sofort. Originale und Prüfverlauf bleiben erhalten.</p>
		<details><summary>Was diese erste Regelversion prüft</summary><p>Zeitlose, wortgleich normalisierte Aussagen zu einer bestätigten Entität. Herkunft und Aussagebeleg müssen zuvor nachvollziehbar geprüft worden sein. Freie Zusammenfassungen, ungeklärte Personenbezüge und zeitabhängige Angaben bleiben im Review.</p></details>
	</section>

	{#if data.delegatedReviews.length}
		<section>
			<div class="section-heading"><div><span>PRÜFVERLAUF</span><h2>Beauftragte lokale Prüfungen</h2><p>Du erteilst den Auftrag. Das lokale Modell prüft die Belege; seine Übernahmen werden getrennt von deiner persönlichen Prüfung protokolliert.</p></div></div>
			{#each data.delegatedReviews as review}
				{@const candidate = data.candidateBundles.find((bundle) => bundle.proposal.proposal_id === review.proposal_id)}

				<p><strong>{review.detail.verdict === 'accept' ? 'Nach lokaler Prüfung übernommen' : 'Keine automatische Übernahme'}</strong> · {formatDate(review.recorded_at)}<br /><small>{String(review.detail.review_model)} · Freigegebener Prüfauftrag</small>
					{#if Array.isArray(review.detail.reason_codes) && review.detail.verdict !== 'accept'}<br /><span>{review.detail.reason_codes.map((code) => reasonLabels[String(code)] ?? 'Prüfung braucht Klärung').join(' · ')}</span>{/if}
					{#if candidate}<br /><a href={`#proposal-${candidate.proposal.proposal_id}`}>Vorschlag prüfen: {bundleTitle(candidate)}</a>{/if}
				</p>
			{/each}
		</section>
	{/if}

	{#if data.consolidationBundles.length}
		<section class="consolidation-review">
			<div class="section-heading">
				<div><span>NACHTSCHICHT-PRÜFSTAPEL</span><h2>Gemeinsam aufräumen.</h2><p>Jeder Lauf bleibt ein eigenes Bündel. Eine Entscheidung konsolidiert identische Dubletten, verbindet stabile Entitätsverweise und übernimmt beleggebundene Kontextentwürfe.</p></div>
				<strong class="count">{data.consolidationBundles.length}</strong>
			</div>
			<div class="consolidation-list">
				{#each data.consolidationBundles as bundle}
					<article class="consolidation-card">
						<header>
							<div><span>EIN LAUF · EINE ENTSCHEIDUNG</span><h3>{consolidationChangeCount(bundle) ? `${consolidationChangeCount(bundle)} mögliche Änderungen` : 'Keine erneute Freigabe nötig'}</h3></div>
							<small>{formatDate(bundle.generated_at)}</small>
						</header>
						<div class="consolidation-summary">
							<div><strong>{bundle.report.duplicate_groups.reduce((sum, group) => sum + Math.max(0, group.fact_ids.length - 1), 0)}</strong><span>redundante Fakten</span></div>
							<div><strong>{bundle.report.entity_link_candidates.reduce((sum, candidate) => sum + candidate.fact_ids.length, 0)}</strong><span>Fakten zu verbinden</span></div>
							<div><strong>{bundle.report.semantic_context_drafts.length}</strong><span>neue Kontexte</span></div>
						</div>
						<div class="consolidation-items">
							{#each bundle.report.duplicate_groups as group}
								<div><span>DUBLETTE · {label(domainLabels, group.domain)}</span><strong>{group.label}</strong><small>Ein aktiver Fakt bleibt; {group.fact_ids.length - 1} identische {group.fact_ids.length === 2 ? 'Kopie wird' : 'Kopien werden'} als superseded protokolliert.</small></div>
							{/each}
							{#each bundle.report.entity_link_candidates as candidate}
								<div><span>VERBINDUNG · {label(domainLabels, candidate.domain)}</span><strong>{candidate.entity_label}</strong><small>{candidate.fact_ids.length} bestätigte Fakten werden an den bestehenden Kern gehängt; Inhalt und Quellen bleiben unverändert.</small></div>
							{/each}
							{#each bundle.report.semantic_context_drafts as context}
								<div><span>KONTEXT · {label(domainLabels, context.domain)}</span><strong>{context.title}</strong><small>{context.summary} · {context.fact_ids.length} Fakten · {context.evidence?.origin_source_count ?? '—'} {context.evidence?.origin_source_count === 1 ? 'Ursprungsbeleg' : 'Ursprungsbelege'} (Unabhängigkeit nicht nachgewiesen)</small></div>
							{/each}
							{#each bundle.report.semantic_suggestions as suggestion}
								<div class="advisory"><span>NUR HINWEIS · {label(domainLabels, suggestion.domain)}</span><strong>{suggestion.title}</strong><small>{suggestion.reason} Dieser Hinweis ändert noch keinen Graphen.</small></div>
							{/each}
						</div>
						{#if bundle.report.suppressed_contexts?.length}
							<details>
								<summary>{bundle.report.suppressed_contexts.length} Kontextvorschläge ohne erneute Freigabe</summary>
								<div class="consolidation-items">
									{#each bundle.report.suppressed_contexts as context}
										<div class="advisory"><strong>{context.title}</strong><small>{context.suppression_reason} {context.evidence?.origin_source_count ?? '—'} {context.evidence?.origin_source_count === 1 ? 'Ursprungsbeleg' : 'Ursprungsbelege'} · keine Änderung an bestätigten Fakten.</small></div>
									{/each}
								</div>
							</details>
						{/if}
						{#if consolidationChangeCount(bundle) > 0}
						<footer>
							<form method="POST" action={memoryFormAction(page.url.search, 'rejectConsolidation')} use:enhance><input type="hidden" name="run_id" value={bundle.run_id} /><button class="ghost" type="submit"><X size={17} /> Bündel verwerfen</button></form>
							<form method="POST" action={memoryFormAction(page.url.search, 'applyConsolidation')} use:enhance><input type="hidden" name="run_id" value={bundle.run_id} /><button class="primary" type="submit"><Check size={17} /> Gemeinsam übernehmen</button></form>
						</footer>
						{/if}
					</article>
				{/each}
			</div>
		</section>
	{/if}
	{/if}

	{#if addOpen}
		<section class="composer">
			<div class="section-heading"><div><span>Direkt bestätigen</span><h2>Wissen ergänzen</h2></div><button class="icon" type="button" onclick={() => (addOpen = false)} aria-label="Schliessen"><X size={19} /></button></div>
			<form method="POST" action={memoryFormAction(page.url.search, 'add')} use:enhance class="add-grid">
				<label>Domäne<select name="domain" required><option value="ai">AI & Folio</option><option value="career">Karriere</option><option value="personal">Persönlich</option><option value="finance">Finanzen</option><option value="health">Gesundheit</option></select></label>
				<label>Art<select name="data_class" required><option value="product_fact">Produktfakt</option><option value="profile">Profil</option><option value="preference">Präferenz</option><option value="voice_rule">Sprachregel</option><option value="voice_example">Schreibbeispiel</option><option value="decision">Entscheidung</option><option value="context">Kontext</option></select></label>
				<label>Vertraulichkeit<select name="sensitivity" required><option value="private">privat</option><option value="public">öffentlich</option><option value="sensitive">sensibel</option></select></label>
				<label class="wide">Worum geht es?<input name="subject" maxlength="240" placeholder="z. B. Folio oder meine Schreibweise" required /></label>
				<label class="wide">Was soll Folio wissen?<textarea name="value" maxlength="8000" rows="4" placeholder="Eine klare, überprüfbare Aussage. Keine Anweisung an das Modell." required></textarea></label>
				<div class="wide form-end"><small>Manuell eingetragenes Wissen gilt als von dir bestätigt.</small><button class="primary" type="submit"><Check size={17} /> Speichern</button></div>
			</form>
		</section>
	{/if}

	{#if data.memoryView==='overview'}
	<section class="context-lab">
		<div class="section-heading">
			<div><span>FRAG FOLIO</span><h2>Was weiss Folio dazu?</h2><p>Durchsucht nur bestätigtes Wissen innerhalb der gewählten Domäne und Vertraulichkeit.</p></div>
			<FileSearch size={24} />
		</div>
		<form method="GET" class="query-form">
			<label>Domäne<select name="domain">{#each domains as domain}<option value={domain} selected={data.previewInput.domain === domain}>{label(domainLabels, domain)}</option>{/each}</select></label>
			<label>Bis<select name="sensitivity"><option value="public" selected={data.previewInput.maxSensitivity === 'public'}>öffentlich</option><option value="private" selected={data.previewInput.maxSensitivity === 'private'}>privat</option><option value="sensitive" selected={data.previewInput.maxSensitivity === 'sensitive'}>sensibel</option></select></label>
			<label class="query">Frage oder neuer Inhalt<input name="q" value={data.previewInput.query} placeholder="z. B. Wie beschreibe ich Folio, ohne etwas zu erfinden?" /></label>
			<button class="secondary" type="submit">Wissen durchsuchen</button>
		</form>
		{#if data.preview}
			<div class="context-result">
				<div class="result-head"><Database size={18} /><strong>{data.preview.facts.length} belegte Treffer</strong><span>{data.preview.query_terms.length} Suchbegriffe</span></div>
				{#if data.preview.facts.length}
					<div class="fact-list compact">
						{#each data.preview.facts as fact}
							<article class="fact-card">
								<div class="fact-top"><span class="domain">{label(domainLabels, fact.domain)}</span><span>{label(classLabels, fact.data_class)}</span><span>{sensitivityLabels[fact.sensitivity]}</span></div>
								{#if fact.entity_label}<div class="entity-line">{fact.entity_label}</div>{/if}
								<h3>{fact.subject}</h3><p>{factValue(fact)}</p><small>Quelle: {fact.source_kind} · {fact.source_ref}{fact.valid_from ? ` · Ereignis ${formatDate(fact.valid_from)}` : ''}</small>
							</article>
						{/each}
					</div>
				{:else}
					<div class="empty"><strong>Noch kein belastbarer Kontext.</strong><span>Genau in diesem Zustand soll Folio lieber schweigen als Erfahrung erfinden.</span></div>
				{/if}
			</div>
		{/if}
	</section>
	{/if}
	{#if ['review','processing'].includes(data.memoryView)}
		<section class="view-intro"><div><h2>{data.memoryView==='processing'?'Vorbereitung & Warten':'Deine Entscheidung'}</h2><p>{data.memoryView==='processing'?'Zahlungsbelege warten auf den passenden Monatsauszug. Weitere Fälle sind nach der nötigen Nacharbeit geordnet.':'Hier bleiben Zuordnungen, Wissensauswahl und offene Fälle nach dem Kontoabgleich.'}</p></div></section>
		{#if data.memoryView==='processing' && data.workRuntime}
			<div class="work-note"><strong>{data.workRuntime.enabled?'Automatische Nacharbeit eingerichtet':'Automatische Nacharbeit pausiert'}</strong><span> · Datumsberichtigungen: {Object.values(data.workRuntime.repairs).filter(r=>r.feedbackId).length} · Zur Entscheidung: {Object.values(data.workRuntime.repairs).filter(r=>r.status==='needs_review').length}</span>{#if data.workRuntime.monthly}<span> · Monatsabgleich: {({pending:'bereit',running:'läuft',completed:'abgeschlossen',retry:'erneuter Versuch folgt'} as Record<string,string>)[data.workRuntime.monthly.status]??data.workRuntime.monthly.status}</span>{/if}{#if data.workRuntime.enabled}<form method="POST" action={memoryFormAction(page.url.search, 'pauseWork')} use:enhance><button class="ghost" type="submit">Nacharbeit pausieren</button></form>{:else}<form method="POST" action={memoryFormAction(page.url.search, 'resumeWork')} use:enhance><button class="ghost" type="submit">Nacharbeit fortsetzen</button></form>{/if}</div>
		{/if}
		<form class="work-filters" method="GET">
			<input type="hidden" name="view" value={data.memoryView}/>
			<label>Bereich<select name="work_domain" value={data.workDomain}><option value="">Alle Bereiche</option>{#each [...new Set([...data.workDomains, ...(data.workDomain ? [data.workDomain] : [])])] as domain}<option value={domain}>{label(domainLabels,domain)}</option>{/each}</select></label>
			<label>Aufgabe<select name="kind" value={data.workKind}><option value="">Alle Aufgaben</option>{#each Object.entries(data.workKinds) as [key,title]}<option value={key}>{title}</option>{/each}</select></label>
			<label>Anzahl<select name="limit" value={data.reviewLimit}>{#each [10,25,100] as limit}<option value={limit}>{limit}</option>{/each}</select></label><button class="secondary" type="submit">Anzeigen</button>
		</form>
		{#if !data.candidateBundles.length && !data.candidateGroups.length}<div class="empty"><strong>Keine Fälle in dieser Auswahl.</strong></div>{/if}
	{/if}

	{#if ['review','processing'].includes(data.memoryView) && data.candidateBundles.length}
		<section>
			<div class="section-heading"><div><h2>Die nächsten Fälle</h2></div><strong class="count">{data.candidateBundles.length}</strong></div>
			<div class="source-groups">
				{#each data.candidateBundles as bundle}
					{@const pendingFacts = bundle.facts.filter((fact) => fact.status === 'candidate').length}
     {@const pendingEntries = pendingFacts || bundle.episodes.filter(e=>e.status==='candidate').length}
					<article id={`proposal-${bundle.proposal.proposal_id}`} class="source-group graph-bundle">
						<header class="group-head">
							<div><span class="group-eyebrow">{data.workKinds[bundle.work.kind]}</span><h3>{bundle.profileGroup ? `${bundle.profileGroup.person} · Qualifikationen & Erfahrung` : bundleTitle(bundle)}</h3><p>{bundle.work.question}</p><p>{#if bundle.profileGroup}{bundle.profileGroup.claimCount} Angaben aus {bundle.profileGroup.sourceCount} Belegen{:else}{pendingEntries} {pendingEntries === 1 ? 'unbestätigte Angabe' : 'unbestätigte Angaben'} aus {bundle.proposal.source_kind==='file'?'diesem Dokument':bundle.proposal.source_kind==='attachment'?'diesem PDF-Anhang':'dieser Nachricht'}{/if}</p></div>
							<small>{#if bundle.profileGroup}Gemeinsame Prüfmappe{:else}{bundle.proposal.source_ref}<br/>{bundle.source_date ? `Mail vom ${formatDate(bundle.source_date)}` : 'Quelldatum nicht verfügbar'} · importiert {formatDate(bundle.proposal.created_at)}{/if}</small>
						</header>

      {#if bundle.profileGroup}
       {#each bundle.profileGroup.sections as section}
        <details class="bundle-detail" open={section.key==='qualification'}>
         <summary>{section.label} · {section.claims.length}</summary>
         {#each section.claims as claim}
          <div class="profile-claim"><p>{claim.text}</p><details><summary>{claim.variants.length} {claim.variants.length===1?'Beleg':'Belege'} ansehen</summary>
           {#each claim.variants as variant}<div class="work-note"><p>{variant.text}</p><a href={`/memory?view=${data.memoryView}&kind=profile&proposal=${variant.proposalId}#proposal-${variant.proposalId}`}>Einzelbeleg prüfen →</a><small>{data.profileSourceLabels[variant.source]??variant.source}</small></div>{/each}
          </details></div>
         {/each}
        </details>
       {/each}
       {#each bundle.profileGroup.issues as issue}<p class="work-note"><a href={`/memory?view=${data.memoryView}&kind=profile&proposal=${issue.id}#proposal-${issue.id}`}>Beleg prüfen</a> · {issue.reasons.map(r=>label(reasonLabels,r)).join(' · ')}</p>{/each}
       <div class="review-actions group-actions"><span>{bundle.profileGroup.repeated ? `${bundle.profileGroup.repeated} wortgleiche Belegstellen zusammengefasst` : `${bundle.profileGroup.sourceCount} Belege gemeinsam prüfen`}</span>
        <form method="POST" action={memoryFormAction(page.url.search,'confirmProfile')} use:enhance><input type="hidden" name="proposal_ids" value={JSON.stringify(bundle.profileGroup.ids)}/><input type="hidden" name="digest" value={bundle.profileGroup.digest}/><button class="primary small" type="submit"><Check size={16}/> Alle {bundle.profileGroup.ids.length} Belege bestätigen</button></form>
       </div>
      {/if}
      {#if !bundle.profileGroup || page.url.searchParams.get('proposal')===bundle.proposal.proposal_id}
						{#if bundle.historical_facts.length}<p class="historical-notice">{bundle.historical_facts.length} vergangene Termine bleiben unbestätigt in der Historie. Den übrigen Kontext prüfst du als damaligen Sachstand – nicht als heute offene Aufgabe. Die gemischte Zusammenfassung wird nicht mitbestätigt.</p><details class="bundle-detail historical-detail"><summary>Vergangene Termine ansehen</summary>{#each bundle.historical_facts as fact}<p>{fact.subject} · {fact.value_text} <small>Historisch · kein Kalendereintrag vorgeschlagen</small></p>{/each}</details>{/if}
						{#if !pendingFacts}{#each bundle.episodes.filter(e=>e.status==='candidate') as episode}<p class="work-note">{episode.summary}</p>{/each}{/if}
						{#if bundle.work.reasons.length}<p class="work-note">{bundle.work.reasons.map(r=>label(reasonLabels,r)).join(' · ')}</p>{/if}
						{#if bundle.related.length}<details class="bundle-detail"><summary>{bundle.related.length} weitere Belege zum selben Vorgang</summary>{#each bundle.related as related}<p><a href={`/memory?view=${data.memoryView}&proposal=${related.id}#proposal-${related.id}`}>{related.date?formatDate(related.date):'Beleg'} · {related.source}</a></p>{/each}</details>{/if}
						<div class="structured-facts">
							{#each bundle.facts.filter((item) => item.status === 'candidate') as fact}
								<div class="structured-fact">
									<span>{label(predicateLabels, fact.predicate)}{#if bundle.work.flagged.includes(fact.fact_id)} · zu berichtigen{/if}</span>
									<strong>{factValue(fact)}</strong>
                                    {#if data.calendarMatches?.[fact.fact_id]}<small>✓ Bereits im Kalender · keine erneute Termineintragung nötig</small>{/if}
                                    {#if data.calendarConflicts?.[fact.fact_id]}<small>{data.calendarConflicts[fact.fact_id]}</small>{/if}
                                    {#if fact.predicate === 'scheduled_for'}<a href={`/calendar?source=${fact.fact_id}`}>Mit Kalender abgleichen →</a>{/if}
									{#if factHint(fact, bundleTitle(bundle))}<small>{factHint(fact, bundleTitle(bundle))}</small>{/if}
									<div class="fact-meta"><span>{label(domainLabels, fact.domain)}</span><span>{sensitivityLabels[fact.sensitivity]}</span>{#if fact.valid_from && fact.predicate !== 'received_at'}<span>{formatDate(fact.valid_from)}</span>{/if}</div>
									<a href={`/memory/changes?fact=${fact.fact_id}`}>Angabe berichtigen</a>
									{#if data.memoryView==='review' && fact.predicate!=='paid'}<form method="POST" action={memoryFormAction(page.url.search, 'confirm')} use:enhance><input type="hidden" name="fact_id" value={fact.fact_id}/><button type="submit" class="ghost">Diese Angabe bestätigen</button></form>{/if}
								</div>
							{/each}
						</div>
						{#if bundle.facts.some((fact) => fact.status === 'superseded')}
							<p>Einzeln korrigiert: Die neuen Aussagen sind noch unbestätigt. Frühere Aussagen und ausgeschlossene Zusammenfassungen bleiben im Verlauf erhalten.</p>
							<details class="bundle-detail"><summary>Korrekturverlauf</summary>
								{#each bundle.facts.filter((fact) => fact.status === 'superseded') as previous}<p>Ersetzt: {label(predicateLabels, previous.predicate)} · {previous.value_text}</p>{/each}
							</details>
						{/if}
						{#if evidenceItems(bundle).length}
							<details class="bundle-detail evidence-detail">
								<summary>Belege prüfen <span>{evidenceItems(bundle).length}</span></summary>
								<div class="evidence-list">
									{#each evidenceItems(bundle) as evidence}
										<blockquote><strong>{evidence.labels.join(' · ')}</strong>{evidence.excerpt}</blockquote>
									{/each}
								</div>
							</details>
						{/if}
						<details class="bundle-detail structure-detail">
							<summary>Technische Struktur <span>{bundle.entities.length} Entitäten · {bundle.relations.length} Beziehungen · {bundle.episodes.length} Ereignisse</span></summary>
							{#if bundle.entities.length}
								<div class="object-strip">
									{#each bundle.entities as entity}
										<div class="entity-chip"><span>{label(classLabels, entity.entity_type)}</span><strong>{entity.canonical_label}</strong></div>
									{/each}
								</div>
							{/if}
							{#if bundle.relations.length || bundle.episodes.length}
								<div class="graph-details">
									{#each bundle.relations as relation}
										<div><span>BEZIEHUNG</span><strong>{entityLabel(bundle, relation.subject_entity_id)} → {label(relationLabels, relation.relation_type)} → {entityLabel(bundle, relation.object_entity_id)}</strong></div>
									{/each}
									{#each bundle.episodes as episode}
										<div><span>{episode.status === 'rejected' ? 'AUSGESCHLOSSENE ZUSAMMENFASSUNG' : 'EREIGNIS'} · {formatDate(episode.occurred_at)}</span><strong>{episode.title}</strong><small>{episode.summary}</small></div>
									{/each}
								</div>
							{/if}
						</details>
						<div class="review-actions group-actions">
							<form method="POST" action={memoryFormAction(page.url.search, 'rejectProposal')} use:enhance><input type="hidden" name="proposal_id" value={bundle.proposal.proposal_id} /><button class="ghost" type="submit"><X size={16} /> Beleg verwerfen</button></form>
							{#if bundle.facts.length === 1 && data.calendarMatches?.[bundle.facts[0].fact_id] && !bundle.entities.length && !bundle.relations.length && bundle.episodes.every(e => e.summary.includes(bundle.facts[0].value_text) && e.source_ref === bundle.facts[0].source_ref)}<span>✓ Bereits im Kalender · keine Bestätigung erforderlich</span>{:else}<form method="POST" action={memoryFormAction(page.url.search, 'confirmProposal')} use:enhance><input type="hidden" name="proposal_id" value={bundle.proposal.proposal_id} /><button class="primary small" type="submit"><Check size={16} /> {bundle.historical_facts.length ? 'Übrige Angaben bestätigen' : 'Bündel bestätigen'}</button></form>{/if}
						</div>
      {/if}
					</article>
				{/each}
			</div>
		</section>
	{/if}

	{#if ['review','processing'].includes(data.memoryView) && data.candidateGroups.length}
		<section>
			<div class="section-heading"><div><span>PRÜFSTAPEL</span><h2>Vorgeschlagenes Wissen</h2><p>Eine Mail, eine Entscheidung. Die enthaltenen Fakten bleiben einzeln belegbar.</p></div><strong class="count">{data.candidateGroups.length}</strong></div>
			<div class="source-groups">
				{#each data.candidateGroups as group}
					<article class="source-group">
						<header class="group-head">
							<div><span class="group-eyebrow">EIN BELEG</span><h3>{group.facts.length} {group.facts.length === 1 ? 'Wissenseintrag' : 'Wissenseinträge'}</h3></div>
							<small>{group.source_ref} · vorgeschlagen {formatDate(group.facts[0].recorded_at)}</small>
						</header>
						<div class="group-facts">
							{#each group.facts as fact}
								<div class="candidate-fact">
									<div class="fact-top"><span class="domain">{label(domainLabels, fact.domain)}</span><span>{label(classLabels, fact.data_class)}</span><span>{sensitivityLabels[fact.sensitivity]}</span><span>{sourceLabel(fact.source_kind)}</span></div>
									{#if fact.entity_label}<div class="entity-line">{fact.entity_label}</div>{/if}
									<h3>{fact.subject}</h3><p>{factValue(fact)}</p>
									{#if fact.source_excerpt}<blockquote><strong>Beleg</strong>{fact.source_excerpt}</blockquote>{/if}
									{#if fact.valid_from}<small>Ereignis {formatDate(fact.valid_from)}</small>{/if}
									<a href={`/memory/changes?fact=${fact.fact_id}`}>Angabe berichtigen</a>
									{#if data.memoryView==='review' && fact.predicate!=='paid'}<form method="POST" action={memoryFormAction(page.url.search, 'confirm')} use:enhance><input type="hidden" name="fact_id" value={fact.fact_id}/><button type="submit" class="ghost">Diese Angabe bestätigen</button></form>{/if}
								</div>
							{/each}
						</div>
						<div class="review-actions group-actions">
							<form method="POST" action={memoryFormAction(page.url.search, 'rejectSource')} use:enhance><input type="hidden" name="domain" value={group.domain} /><input type="hidden" name="source_ref" value={group.source_ref} /><button class="ghost" type="submit"><X size={16} /> Beleg verwerfen</button></form>
							<form method="POST" action={memoryFormAction(page.url.search, 'confirmSource')} use:enhance><input type="hidden" name="domain" value={group.domain} /><input type="hidden" name="source_ref" value={group.source_ref} /><button class="primary small" type="submit"><Check size={16} /> Alles bestätigen</button></form>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.memoryView==='history'}
		<section class="view-intro review-intro"><div><span>HISTORISCHE BELEGE · UNBESTÄTIGT</span><h2>Vergangene Termine</h2><p>Kein heutiger Handlungsbedarf allein aufgrund des Datums. „Vergangen“ bedeutet weder erledigt noch bestätigt. Quellen und Zusammenfassungen bleiben erhalten.</p><small>{data.temporalCounts.historicalOnlyBundles} rein historische Bündel · {data.temporalCounts.mixedBundles} Bündel mit separat prüfbaren Angaben</small></div><nav aria-label="Anzahl historischer Bündel">{#each [10,25,100] as limit}<a class:active={data.reviewLimit===limit} href={`/memory?view=history&limit=${limit}`}>{limit}</a>{/each}</nav></section>
		<div class="source-groups">
			{#each data.historicalBundles as bundle}
				<article class="source-group">
					<header class="group-head"><div><span class="group-eyebrow">HISTORISCH · KEINE AKTUELLE PRIORITÄT</span><h3>{bundleTitle(bundle)}</h3></div><small>{bundle.source_date ? `Mail vom ${formatDate(bundle.source_date)}` : 'Quelldatum nicht verfügbar'}<br/>importiert {formatDate(bundle.proposal.created_at)}</small></header>
					<div class="structured-facts">{#each bundle.historical_facts as fact}<div class="structured-fact"><span>VERGANGENER TERMIN · UNBESTÄTIGT</span><strong>{fact.value_text}</strong><small>{fact.subject}</small>{#if fact.source_excerpt}<blockquote>{fact.source_excerpt}</blockquote>{/if}</div>{/each}</div>
					<details class="bundle-detail"><summary>Herkunft und damaliger Verlauf</summary><small>{bundle.proposal.source_ref}</small>{#each bundle.episodes as episode}<p>{episode.summary}</p>{/each}</details>
					{#if bundle.hasReviewWork}<p class="historical-notice">Übrige Angaben bleiben separat prüfbar; diese alten Termine werden dabei nicht bestätigt. <a href={`/memory?view=review&proposal=${bundle.proposal.proposal_id}#proposal-${bundle.proposal.proposal_id}`}>Zur aktiven Prüfung</a></p>{/if}
				</article>
			{/each}
			{#each data.historicalStandalone as fact}<article class="fact-card"><div class="fact-top"><span>HISTORISCH · UNBESTÄTIGT</span></div><h3>{fact.subject}</h3><p>{fact.value_text}</p>{#if fact.source_excerpt}<blockquote>{fact.source_excerpt}</blockquote>{/if}<small>{fact.source_ref} · importiert {formatDate(fact.recorded_at)}</small></article>{/each}
		</div>
		{#if !data.historicalBundles.length && !data.historicalStandalone.length}<div class="empty"><strong>Keine historischen Terminkandidaten.</strong></div>{/if}
	{/if}

	{#if data.memoryView==='knowledge' && data.dossiers.length}
		<section>
			<div class="section-heading"><div><span>DOSSIERS & VERLAUF</span><h2>Was zusammengehört</h2><p>Folgemails ergänzen dasselbe Dossier. Quellen und einzelne Ereignisse bleiben trotzdem belegbar.</p></div></div>
			<div class="dossier-list">
				{#each data.dossiers.slice(0, 12) as dossier}
					<article class="dossier-card">
						<div class="dossier-head"><div><span>{label(domainLabels, dossier.root_entity.domain)}</span><strong>{dossier.root_entity.canonical_label}</strong></div><small>{dossier.source_refs.length} {dossier.source_refs.length === 1 ? 'Beleg' : 'Belege'}</small></div>
						<div class="object-strip">
							{#each dossier.entities as entity}
								<div class="entity-chip"><span>{label(classLabels, entity.entity_type)}</span><strong>{entity.canonical_label}</strong></div>
							{/each}
						</div>
						{#if dossierSummaryFacts(dossier).length}
							<div class="dossier-summary">
								{#each dossierSummaryFacts(dossier) as fact}
									<div><span>{label(predicateLabels, fact.predicate)}</span><strong>{factValue(fact)}</strong>
                                    {#if data.calendarMatches?.[fact.fact_id]}<small>✓ Bereits im Kalender · keine erneute Termineintragung nötig</small>{/if}
                                    {#if data.calendarConflicts?.[fact.fact_id]}<small>{data.calendarConflicts[fact.fact_id]}</small>{/if}
										{#if fact.predicate === 'scheduled_for'}{#if historicalFactIds.has(fact.fact_id)}<small>Historisch · kein aktueller Kalendereintrag vorgeschlagen</small>{:else}<a href={`/calendar?source=${fact.fact_id}`}>Mit Kalender abgleichen →</a>{/if}{/if}</div>
								{/each}
							</div>
						{/if}
						{#if dossier.episodes.length}<div class="timeline-mini">{#each dossier.episodes as episode}<div><time>{formatDate(episode.occurred_at)}</time><span>{episode.title}</span></div>{/each}</div>{/if}
						<details class="dossier-technical">
							<summary>{dossier.facts.length} belegte Einzelfakten</summary>
							<div class="dossier-fact-list">
								{#each dossier.facts as fact}
									<div><span>{label(predicateLabels, fact.predicate)}</span><strong>{factValue(fact)}</strong>
                                    {#if data.calendarMatches?.[fact.fact_id]}<small>✓ Bereits im Kalender · keine erneute Termineintragung nötig</small>{/if}
                                    {#if data.calendarConflicts?.[fact.fact_id]}<small>{data.calendarConflicts[fact.fact_id]}</small>{/if}
										{#if fact.predicate === 'scheduled_for'}{#if historicalFactIds.has(fact.fact_id)}<small>Historisch · kein aktueller Kalendereintrag vorgeschlagen</small>{:else}<a href={`/calendar?source=${fact.fact_id}`}>Mit Kalender abgleichen →</a>{/if}{/if}<form method="POST" action={memoryFormAction(page.url.search, 'forget')} use:enhance><input type="hidden" name="fact_id" value={fact.fact_id} /><button class="forget" type="submit" aria-label="Aus Gedächtnis entfernen" title="Aus Gedächtnis entfernen"><Trash2 size={15} /></button></form></div>
								{/each}
							</div>
						</details>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.memoryView==='knowledge'}
	<section>
		<div class="section-heading"><div><span>KANONISCH</span><h2>Weitere bestätigte Fakten</h2><p>Einzelfakten ohne eigenes Dossier. Auch sie dürfen in begrenzte Kontextpakete einfliessen.</p></div><strong class="count">{standaloneConfirmed.length}</strong></div>
		{#if standaloneConfirmed.length}
			<div class="fact-list">
				{#each standaloneConfirmed as fact}
					<article class="fact-card confirmed">
						<div class="fact-top"><span class="domain">{label(domainLabels, fact.domain)}</span><span>{label(classLabels, fact.data_class)}</span><span>{sensitivityLabels[fact.sensitivity]}</span></div>
						{#if fact.entity_label}<div class="entity-line">{fact.entity_label}</div>{/if}
						<h3>{fact.subject}</h3><p>{factValue(fact)}</p><div class="fact-foot"><small>{sourceLabel(fact.source_kind)} · bestätigt {formatDate(fact.confirmed_at ?? fact.recorded_at)}{fact.valid_from ? ` · Ereignis ${formatDate(fact.valid_from)}` : ''}</small><form method="POST" action={memoryFormAction(page.url.search, 'forget')} use:enhance><input type="hidden" name="fact_id" value={fact.fact_id} /><button class="forget" type="submit" aria-label="Aus Gedächtnis entfernen" title="Aus Gedächtnis entfernen"><Trash2 size={15} /></button></form></div>
					</article>
				{/each}
			</div>
		{:else}
			<div class="empty"><strong>Keine weiteren Einzelfakten.</strong><span>Verbundenes Wissen steht bereits oben in seinen Dossiers.</span></div>
		{/if}
	</section>
	{/if}
</div>

<style>
 .profile-claim { padding: 14px 20px; border-top: 1px solid var(--color-border); }
 .profile-claim > p { white-space: pre-line; margin: 0 0 8px; }
 .profile-claim small { display:block; overflow-wrap:anywhere; margin-top:8px; }
	.work-filters { display:flex; gap:1rem; flex-wrap:wrap; align-items:end; margin:1rem 0 2rem; }
	.work-filters label {display:grid;gap:.35rem;font-size:.85rem;}
	.work-note {padding:1rem 1.4rem;margin:0;background:var(--bg-subtle,#f4f8fa);font-size:.9rem;}
	.historical-notice { padding: 12px 24px; margin: 0; color: var(--color-muted-foreground); background: hsl(180 20% 96%); font-size: 13px; line-height: 1.5; }
	.historical-detail small { display: block; color: var(--color-muted-foreground); }
	.memory-page { max-width: 1180px; margin: 0 auto; padding: 28px 24px 80px; color: var(--color-foreground); }
	.hero { padding: 22px 4px 30px; }
	.eyebrow, .section-heading span { display: flex; align-items: center; gap: 7px; color: hsl(181 52% 31%); font-size: 11px; font-weight: 700; letter-spacing: .13em; }
	.hero-row { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-top: 10px; }
	h1 { margin: 0; font-size: clamp(34px, 5vw, 54px); line-height: 1.02; letter-spacing: -.045em; }
	.hero p { max-width: 700px; margin: 13px 0 0; color: var(--color-muted-foreground); font-size: 16px; line-height: 1.55; }
	button { font: inherit; cursor: pointer; }
	.hero-actions { display: flex; align-items: center; gap: 9px; }
	.memory-tabs { position: sticky; top: 0; z-index: 4; display: flex; gap: 4px; margin: 0 0 24px; padding: 5px; border: 1px solid var(--color-border); border-radius: 14px; background: color-mix(in srgb, var(--color-background) 92%, transparent); backdrop-filter: blur(12px); }
	.memory-tabs a { display: inline-flex; align-items: center; gap: 7px; min-height: 38px; padding: 0 13px; border-radius: 9px; color: var(--color-muted-foreground); text-decoration: none; font-size: 13px; font-weight: 650; }
	.memory-tabs a.active { color: white; background: hsl(181 47% 32%); }
	.memory-tabs span { display: grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px; color: inherit; background: color-mix(in srgb, currentColor 12%, transparent); font-size: 9px; }
	.primary, .secondary, .ghost { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; padding: 0 16px; border-radius: 11px; font-weight: 600; }
	.primary { border: 1px solid hsl(181 47% 32%); color: white; background: hsl(181 47% 32%); }
	.primary.small { min-height: 38px; }
	.secondary { border: 1px solid var(--color-border); color: var(--color-foreground); background: white; text-decoration: none; }
	.ghost { border: 1px solid transparent; color: var(--color-muted-foreground); background: transparent; }
	.notice { margin: 0 0 18px; padding: 13px 16px; border-radius: 12px; font-size: 14px; }
	.notice.success { color: hsl(154 52% 26%); background: hsl(151 45% 94%); }
	.notice.error { color: hsl(0 62% 38%); background: hsl(0 65% 95%); }
	.summary { display: grid; grid-template-columns: repeat(3, minmax(120px, 1fr)) minmax(260px, 1.7fr); margin-bottom: 28px; border: 1px solid var(--color-border); border-radius: 18px; background: white; overflow: hidden; }
	.summary > div { display: flex; flex-direction: column; justify-content: center; min-height: 104px; padding: 18px 20px; border-right: 1px solid var(--color-border); }
	.summary > div:last-child { border: 0; }
	.summary strong { font-size: 25px; }
	.summary span { color: var(--color-muted-foreground); font-size: 12px; }
	.summary .principle { flex-direction: row; align-items: center; gap: 12px; color: hsl(181 47% 32%); background: hsl(180 28% 96%); }
	.next-action, .view-intro { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin: 0 0 20px; padding: 22px; border: 1px solid hsl(181 27% 78%); border-radius: 18px; background: linear-gradient(135deg,hsl(180 31% 96%),white); }
	.next-action > div > span, .view-intro > div > span { color: hsl(181 47% 31%); font-size: 10px; font-weight: 750; letter-spacing: .12em; }
	.next-action h2, .view-intro h2 { margin: 5px 0 0; font-size: 22px; letter-spacing: -.025em; }
	.next-action p, .view-intro p { margin: 6px 0 0; color: var(--color-muted-foreground); font-size: 13px; }
	.domain-overview { margin-bottom: 22px; padding: 2px 0 8px; }
	.domain-overview .section-heading { margin-top: 18px; }
	.domain-pills { display: flex; flex-wrap: wrap; gap: 8px; }
	.domain-pills > span { display: inline-flex; align-items: center; gap: 9px; padding: 9px 11px; border: 1px solid var(--color-border); border-radius: 11px; background: white; }
	.domain-pills strong { font-size: 12px; }
	.domain-pills small { display: grid; place-items: center; min-width: 22px; height: 22px; border-radius: 999px; color: hsl(181 47% 30%); background: hsl(180 31% 93%); font-size: 9px; }
	.review-intro nav { display: flex; gap: 5px; padding: 4px; border: 1px solid var(--color-border); border-radius: 10px; background: white; }
	.review-intro nav a { display: grid; place-items: center; min-width: 36px; height: 32px; border-radius: 7px; color: var(--color-muted-foreground); text-decoration: none; font-size: 11px; font-weight: 700; }
	.review-intro nav a.active { color: white; background: hsl(181 47% 32%); }
	.principle span { display: flex; flex-direction: column; }
	.principle strong { color: var(--color-foreground); font-size: 14px; }
	.principle small { margin-top: 3px; color: var(--color-muted-foreground); line-height: 1.35; }
	.source-building { margin-bottom: 28px; padding: 20px 22px; border: 1px solid hsl(181 24% 82%); border-radius: 18px; background: hsl(180 24% 98%); }
	.source-building-head { margin: 0 0 14px; }
	.source-building-actions { display: flex; align-items: center; gap: 10px; }
	.source-domain-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
	.source-domain { overflow: hidden; border: 1px solid var(--color-border); border-radius: 12px; background: white; }
	.source-domain summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; cursor: pointer; }
	.source-domain summary span { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 650; }
	.source-domain summary strong { display: grid; place-items: center; min-width: 25px; height: 25px; border-radius: 999px; color: hsl(181 47% 30%); background: hsl(180 31% 93%); font-size: 11px; }
	.source-file-list { display: grid; max-height: 260px; overflow: auto; border-top: 1px solid var(--color-border); }
	.source-file-list > div { display: flex; flex-direction: column; gap: 3px; padding: 10px 14px; border-bottom: 1px solid var(--color-border); }
	.source-file-list > div:last-child { border-bottom: 0; }
	.source-file-list span { font-size: 11px; font-weight: 600; overflow-wrap: anywhere; }
	.source-file-list small { color: var(--color-muted-foreground); font-size: 9px; line-height: 1.4; overflow-wrap: anywhere; }
	.night-shift { margin-bottom: 28px; padding: 20px 22px; border: 1px solid hsl(226 25% 84%); border-radius: 18px; background: linear-gradient(135deg, hsl(228 31% 98%), hsl(180 26% 98%)); }
	.night-shift-head { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
	.night-shift-head > div > span { color: hsl(226 38% 43%); font-size: 10px; font-weight: 750; letter-spacing: .13em; }
	.night-shift h2 { margin: 5px 0 0; font-size: 20px; letter-spacing: -.02em; }
	.night-shift p { max-width: 760px; margin: 6px 0 0; color: var(--color-muted-foreground); font-size: 12px; line-height: 1.5; }
	.night-report { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 18px; border: 1px solid var(--color-border); border-radius: 13px; background: white; overflow: hidden; }
	.night-report > div { display: flex; flex-direction: column; gap: 2px; padding: 13px 15px; border-right: 1px solid var(--color-border); }
	.night-report > div:last-child { border: 0; }
	.night-report strong { font-size: 20px; }
	.night-report span { color: var(--color-muted-foreground); font-size: 10px; }
	.night-findings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
	.night-findings > div { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid var(--color-border); border-radius: 12px; background: white; }
	.night-findings span { color: hsl(181 45% 31%); font-size: 9px; font-weight: 700; letter-spacing: .07em; }
	.night-findings strong { font-size: 12px; }
	.night-findings small { color: var(--color-muted-foreground); font-size: 10px; line-height: 1.4; }
	.night-shift .night-note { margin-top: 10px; font-size: 10px; }
	.spin { display: inline-flex; animation: spin 1s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.consolidation-review { margin-bottom: 30px; }
	.consolidation-list { display: grid; gap: 14px; }
	.consolidation-card { overflow: hidden; border: 1px solid hsl(226 25% 82%); border-left: 3px solid hsl(226 46% 53%); border-radius: 17px; background: white; box-shadow: var(--shadow-xs); }
	.consolidation-card > header { display: flex; align-items: end; justify-content: space-between; gap: 16px; padding: 17px 19px; border-bottom: 1px solid var(--color-border); background: hsl(228 31% 98%); }
	.consolidation-card > header span { color: hsl(226 38% 43%); font-size: 9px; font-weight: 750; letter-spacing: .11em; }
	.consolidation-card > header h3 { margin: 4px 0 0; font-size: 17px; }
	.consolidation-card > header small { color: var(--color-muted-foreground); font-size: 10px; }
	.consolidation-summary { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid var(--color-border); }
	.consolidation-summary > div { display: flex; flex-direction: column; gap: 2px; padding: 12px 17px; border-right: 1px solid var(--color-border); }
	.consolidation-summary > div:last-child { border: 0; }
	.consolidation-summary strong { font-size: 18px; }
	.consolidation-summary span { color: var(--color-muted-foreground); font-size: 9px; }
	.consolidation-items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 14px 17px; }
	.consolidation-items > div { display: flex; flex-direction: column; gap: 4px; padding: 11px 13px; border: 1px solid var(--color-border); border-radius: 11px; background: hsl(180 24% 98%); }
	.consolidation-items > div.advisory { background: hsl(210 25% 99%); }
	.consolidation-items span { color: hsl(181 45% 31%); font-size: 9px; font-weight: 700; letter-spacing: .07em; }
	.consolidation-items strong { font-size: 12px; }
	.consolidation-items small { color: var(--color-muted-foreground); font-size: 10px; line-height: 1.4; }
	.consolidation-card > footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 17px; border-top: 1px solid var(--color-border); }
	section.composer, .context-lab { margin-bottom: 28px; padding: 22px; border: 1px solid var(--color-border); border-radius: 18px; background: hsl(210 25% 98%); }
	.section-heading { display: flex; align-items: start; justify-content: space-between; gap: 20px; margin: 34px 0 15px; }
	.composer .section-heading, .context-lab .section-heading { margin-top: 0; }
	.section-heading h2 { margin: 4px 0 0; font-size: 22px; letter-spacing: -.025em; }
	.section-heading p { margin: 6px 0 0; color: var(--color-muted-foreground); font-size: 13px; line-height: 1.45; }
	.section-heading .count { display: grid; place-items: center; min-width: 38px; height: 38px; border-radius: 50%; color: hsl(181 47% 31%); background: hsl(180 31% 93%); }
	.icon, .forget { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 9px; color: var(--color-muted-foreground); background: transparent; }
	.add-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
	label { display: flex; flex-direction: column; gap: 7px; color: var(--color-muted-foreground); font-size: 12px; font-weight: 600; }
	label.wide { grid-column: 1 / -1; }
	input, select, textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--color-border); border-radius: 10px; color: var(--color-foreground); background: white; font: inherit; font-size: 14px; }
	input, select { min-height: 42px; padding: 0 11px; }
	textarea { padding: 11px; resize: vertical; line-height: 1.5; }
	.form-end { display: flex; align-items: center; justify-content: space-between; }
	.form-end small { color: var(--color-muted-foreground); }
	.query-form { display: grid; grid-template-columns: 150px 130px 1fr auto; align-items: end; gap: 12px; }
	.context-result { margin-top: 18px; border-top: 1px solid var(--color-border); padding-top: 16px; }
	.result-head { display: flex; align-items: center; gap: 8px; color: hsl(181 47% 30%); font-size: 13px; }
	.result-head span { margin-left: auto; color: var(--color-muted-foreground); }
	.fact-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
	.fact-list.compact { margin-top: 13px; }
	.fact-card { min-width: 0; padding: 17px; border: 1px solid var(--color-border); border-radius: 15px; background: white; box-shadow: var(--shadow-xs); }
	.source-groups { display: grid; gap: 14px; }
	.source-group { overflow: hidden; border: 1px solid var(--color-border); border-left: 3px solid hsl(32 88% 56%); border-radius: 16px; background: white; box-shadow: var(--shadow-xs); }
	.group-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; padding: 16px 18px; border-bottom: 1px solid var(--color-border); background: hsl(32 55% 98%); }
	.group-head h3 { margin: 3px 0 0; font-size: 16px; }
	.group-head p { margin: 4px 0 0; color: var(--color-muted-foreground); font-size: 11px; }
	.group-head small { color: var(--color-muted-foreground); font-size: 10px; overflow-wrap: anywhere; }
	.group-eyebrow { color: hsl(32 66% 42%); font-size: 9px; font-weight: 700; letter-spacing: .1em; }
	.object-strip { display: flex; flex-wrap: wrap; gap: 8px; padding: 14px 18px; border-bottom: 1px solid var(--color-border); background: hsl(180 24% 98%); }
	.entity-chip { display: flex; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid hsl(181 27% 84%); border-radius: 999px; background: white; }
	.entity-chip span { color: hsl(181 45% 31%); font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
	.entity-chip strong { font-size: 11px; }
	.graph-details { display: grid; gap: 8px; padding: 14px 18px; border-top: 1px solid var(--color-border); background: hsl(210 25% 99%); }
	.graph-details > div { display: grid; grid-template-columns: 100px 1fr; gap: 4px 12px; align-items: baseline; }
	.graph-details span { color: hsl(181 45% 31%); font-size: 9px; font-weight: 700; letter-spacing: .08em; }
	.graph-details strong { font-size: 12px; }
	.graph-details small { grid-column: 2; color: var(--color-muted-foreground); font-size: 11px; }
	.structured-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.structured-fact { min-width: 0; padding: 17px 18px; border-right: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
	.structured-fact:nth-child(2n) { border-right: 0; }
	.structured-fact > span { display: block; margin-bottom: 7px; color: hsl(181 47% 31%); font-size: 9px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
	.structured-fact > strong { display: block; font-size: 15px; line-height: 1.4; }
	.structured-fact > small { display: block; margin-top: 4px; color: var(--color-muted-foreground); font-size: 11px; }
	.fact-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
	.fact-meta span { padding: 3px 6px; border-radius: 6px; color: var(--color-muted-foreground); background: var(--color-muted); font-size: 9px; }
	.bundle-detail { border-bottom: 1px solid var(--color-border); background: hsl(210 25% 99%); }
	.bundle-detail summary { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 18px; color: var(--color-muted-foreground); font-size: 11px; font-weight: 650; cursor: pointer; }
	.bundle-detail summary span { font-size: 9px; font-weight: 500; }
	.evidence-list { display: grid; gap: 8px; padding: 0 18px 15px; }
	.evidence-list blockquote { display: grid; gap: 4px; margin: 0; padding: 10px 12px; border-left: 2px solid hsl(181 34% 70%); color: var(--color-muted-foreground); background: hsl(180 24% 97%); font-size: 12px; line-height: 1.5; }
	.evidence-list blockquote strong { color: hsl(181 40% 29%); font-size: 9px; letter-spacing: .08em; text-transform: uppercase; }
	.structure-detail .object-strip { border-top: 1px solid var(--color-border); }
	.dossier-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
	.dossier-card { overflow: hidden; border: 1px solid var(--color-border); border-left: 3px solid hsl(181 45% 43%); border-radius: 15px; background: white; box-shadow: var(--shadow-xs); }
	.dossier-head { display: flex; align-items: start; justify-content: space-between; gap: 16px; padding: 15px 17px 10px; }
	.dossier-head > div { display: flex; flex-direction: column; gap: 3px; }
	.dossier-head span { color: hsl(181 45% 31%); font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	.dossier-head strong { font-size: 14px; }
	.dossier-head small { color: var(--color-muted-foreground); font-size: 10px; }
	.dossier-card .object-strip { padding: 10px 16px; }
	.dossier-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-bottom: 1px solid var(--color-border); }
	.dossier-summary > div { display: flex; flex-direction: column; gap: 4px; padding: 11px 16px; border-right: 1px solid var(--color-border); border-top: 1px solid var(--color-border); }
	.dossier-summary > div:nth-child(2n) { border-right: 0; }
	.dossier-summary span, .dossier-fact-list span { color: hsl(181 45% 31%); font-size: 9px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
	.dossier-summary strong { font-size: 12px; }
	.timeline-mini { display: grid; gap: 6px; padding: 11px 16px 14px; }
	.timeline-mini div { display: grid; grid-template-columns: 90px 1fr; gap: 10px; font-size: 11px; }
	.timeline-mini time { color: var(--color-muted-foreground); }
	.dossier-technical { border-top: 1px solid var(--color-border); background: hsl(210 25% 99%); }
	.dossier-technical summary { padding: 10px 16px; color: var(--color-muted-foreground); font-size: 10px; cursor: pointer; }
	.dossier-fact-list { display: grid; gap: 1px; padding: 0 12px 12px; }
	.dossier-fact-list > div { display: grid; grid-template-columns: 105px 1fr auto; align-items: center; gap: 10px; min-height: 38px; padding: 0 7px; border-top: 1px solid var(--color-border); }
	.dossier-fact-list strong { font-size: 11px; }
	.group-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.candidate-fact { min-width: 0; padding: 18px; border-right: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
	.candidate-fact:nth-child(2n) { border-right: 0; }
	.candidate-fact h3 { margin: 13px 0 6px; font-size: 14px; }
	.candidate-fact p { margin: 0; font-size: 14px; line-height: 1.55; white-space: pre-wrap; }
	.candidate-fact blockquote { display: flex; flex-direction: column; gap: 4px; margin: 13px 0 0; padding: 10px 12px; border-left: 2px solid hsl(181 34% 70%); color: var(--color-muted-foreground); background: hsl(180 24% 97%); font-size: 12px; line-height: 1.5; }
	.candidate-fact blockquote strong { color: hsl(181 40% 29%); font-size: 9px; letter-spacing: .08em; text-transform: uppercase; }
	.candidate-fact small { display: block; margin-top: 12px; color: var(--color-muted-foreground); font-size: 10px; }
	.group-actions { margin: 0; padding: 14px 18px; background: hsl(210 25% 99%); }
	.fact-card.confirmed { border-left: 3px solid hsl(181 45% 43%); }
	.fact-top { display: flex; flex-wrap: wrap; gap: 6px; }
	.fact-top span { padding: 4px 7px; border-radius: 7px; color: var(--color-muted-foreground); background: var(--color-muted); font-size: 10px; font-weight: 600; }
	.fact-top .domain { color: hsl(181 49% 28%); background: hsl(180 31% 93%); }
	.entity-line { margin: 12px 0 2px; color: hsl(181 47% 28%); font-size: 11px; font-weight: 700; letter-spacing: .015em; }
	.fact-card h3 { margin: 13px 0 6px; font-size: 14px; }
	.fact-card p { margin: 0; font-size: 14px; line-height: 1.55; white-space: pre-wrap; }
	.fact-card small { display: block; margin-top: 13px; color: var(--color-muted-foreground); font-size: 10px; overflow-wrap: anywhere; }
	.review-actions, .fact-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; }
	.fact-foot small { margin: 0; }
	.empty { display: flex; flex-direction: column; gap: 5px; padding: 26px; border: 1px dashed var(--color-border); border-radius: 15px; color: var(--color-muted-foreground); background: hsl(210 25% 99%); text-align: center; }
	.empty strong { color: var(--color-foreground); }
	@media (max-width: 850px) { .summary { grid-template-columns: repeat(3, 1fr); }.summary .principle { grid-column: 1 / -1; }.fact-list, .group-facts, .dossier-list, .structured-facts, .night-findings, .consolidation-items, .source-domain-grid { grid-template-columns: 1fr; }.candidate-fact, .structured-fact { border-right: 0; }.query-form { grid-template-columns: 1fr 1fr; }.query-form .query { grid-column: 1 / -1; }.query-form button { grid-column: 1 / -1; }.hero-row, .group-head, .night-shift-head, .next-action, .view-intro { align-items: start; flex-direction: column; }.night-report { grid-template-columns: 1fr 1fr; }.night-report > div:nth-child(2) { border-right: 0; } }
	@media (max-width: 560px) { .memory-page { padding: 18px 12px 60px; }.hero-actions { align-items: stretch; flex-direction: column; width: 100%; }.memory-tabs { overflow-x: auto; }.memory-tabs a { flex: 0 0 auto; }.summary { grid-template-columns: 1fr 1fr; }.summary > div { border-bottom: 1px solid var(--color-border); }.summary > div:nth-child(2) { border-right: 0; }.summary > div:nth-child(3) { grid-column: 1 / -1; border-right: 0; }.next-action .primary { width: 100%; }.add-grid { grid-template-columns: 1fr; }.add-grid label, label.wide { grid-column: 1; }.form-end { align-items: stretch; flex-direction: column; gap: 12px; }.query-form { grid-template-columns: 1fr; }.query-form .query, .query-form button { grid-column: 1; }.consolidation-summary { grid-template-columns: 1fr; }.consolidation-summary > div { border-right: 0; border-bottom: 1px solid var(--color-border); }.consolidation-summary > div:last-child { border-bottom: 0; }.consolidation-card > footer { align-items: stretch; flex-direction: column-reverse; }.consolidation-card > footer form, .consolidation-card > footer button { width: 100%; } }
</style>
