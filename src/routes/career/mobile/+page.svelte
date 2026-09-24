<script lang="ts">
	import { untrack } from 'svelte';
	import { ArrowLeft, BellRing, BriefcaseBusiness, Check, ChevronDown, Clock3, ExternalLink, FileCheck2, HelpCircle, Pause, Play, ShieldCheck, X } from 'lucide-svelte';
	import SlideToConfirm from '$lib/components/SlideToConfirm.svelte';
	import type { CareerLeadAction } from '$lib/server/career/types.js';

	let { data } = $props();
	let overrides = $state<Record<string, (typeof data.leads)[number]>>({});
	let selectedId = $state(untrack(() => data.initialLeadId ?? data.leads[0]?.lead_id ?? null));
	let saving = $state(false);
	let message = $state('');
	let errorMessage = $state(false);
	let showHistory = $state(false);
	let showDecline = $state(false);
	let submittedAt = $state(localDateTimeValue());
	let applicationChannel = $state('portal');
	let declineReason = $state('not_interested');

	const leads = $derived(data.leads.map((lead) => overrides[lead.lead_id] ?? lead));
	const active = $derived(leads.filter((lead) => !['closed', 'submitted', 'declined'].includes(lead.status)));
	const history = $derived(leads.filter((lead) => ['closed', 'submitted', 'declined'].includes(lead.status)));
	const selected = $derived(leads.find((lead) => lead.lead_id === selectedId) ?? active[0] ?? history[0] ?? null);
	const activeCount = $derived(active.length);

	function localDateTimeValue(date = new Date()): string {
		return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
	}

	function idempotencyKey(leadId: string, revision: number, action: CareerLeadAction): string {
		return `career-mobile:${leadId}:${revision}:${action}:${crypto.randomUUID()}`;
	}

	function formatDate(value: string): string {
		return new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
	}

	function elapsed(value: string): string {
		const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
		if (minutes < 60) return `${minutes} Min.`;
		const hours = Math.floor(minutes / 60);
		if (hours < 48) return `${hours} Std. ${minutes % 60} Min.`;
		return `${Math.floor(hours / 24)} Tage`;
	}

	function duration(milliseconds: number): string {
		const minutes = Math.max(0, Math.round(milliseconds / 60_000));
		if (minutes < 60) return `${minutes} Min.`;
		const hours = Math.floor(minutes / 60);
		if (hours < 48) return `${hours} Std. ${minutes % 60} Min.`;
		return `${Math.floor(hours / 24)} Tage ${hours % 24} Std.`;
	}

	function stateLabel(lead: (typeof leads)[number]): string {
		if (lead.status === 'submitted') return 'EINGEREICHT';
		if (lead.status === 'declined') return 'ABGELEHNT';
		if (lead.status === 'closed') return 'GESCHLOSSEN';
		return lead.decision === 'CLARIFY' ? 'ZUERST KLÄREN' : 'JETZT BEWERBEN';
	}

	function basePayload(lead: (typeof leads)[number], action: CareerLeadAction) {
		return {
			action,
			lead_id: lead.lead_id,
			case_id: lead.case_id,
			assessment_id: lead.assessment_id,
			expected_revision: lead.revision,
			availability_event_id: lead.availability_event_id,
			source_snapshot_hash: lead.source_snapshot_hash,
			idempotency_key: idempotencyKey(lead.lead_id, lead.revision, action)
		};
	}

	async function act(action: CareerLeadAction) {
		if (!selected || saving || !data.canWrite) return;
		const lead = selected;
		saving = true;
		message = '';
		errorMessage = false;
		const extra = action === 'snooze'
			? { snooze_until: new Date(Date.now() + 4 * 3_600_000).toISOString(), reason_code: 'later_today' }
			: action === 'confirm_submitted'
				? { submitted_at: new Date(submittedAt).toISOString(), application_channel: applicationChannel, artifact_refs: [] }
				: action === 'decline'
					? { reason_code: declineReason, note: null }
					: {};
		try {
			const response = await fetch('/api/career/lead-action', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...basePayload(lead, action), ...extra })
			});
			if (!response.ok) throw new Error(String(response.status));
			const value = await response.json();
			overrides[lead.lead_id] = value.lead;
			overrides = { ...overrides };
			showDecline = false;
			message = action === 'confirm_submitted'
				? 'Einreichung lokal bestätigt. Folio hat nichts versendet.'
				: action === 'decline'
					? 'Lead abgeschlossen; der Grund bleibt nachvollziehbar.'
					: 'Entscheidung lokal protokolliert.';
		} catch {
			errorMessage = true;
			message = 'Der Lead hat sich verändert. Bitte Ansicht neu laden und erneut prüfen.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Folio · Karriere mobil</title>
	<meta name="theme-color" content="#f8fafc" />
</svelte:head>

<div class="career-mobile-root">
	<header class="app-head">
		<a href="/mobile" aria-label="Zur Folio-Zentrale"><ArrowLeft size={21} /></a>
		<div class="mark"><BriefcaseBusiness size={20} /></div>
		<div><strong>Karriere</strong><span>Folio · zeitkritische Leads</span></div>
		<b>{activeCount}</b>
	</header>

	<main>
		{#if message}<div class:error={errorMessage} class="feedback" role="status">{#if errorMessage}<ShieldCheck size={16} />{:else}<Check size={16} />{/if}{message}</div>{/if}
		{#if leads.length === 0}
			<section class="empty">
				<BellRing size={30} />
				<strong>Keine zeitkritischen Leads</strong>
				<p>Sobald ein belegter Fit von 9 oder 10 das Karriere-Gate passiert, erscheint er hier mit Originalquelle und nächstem Schritt.</p>
				<small>Carta bleibt bis zur vollständigen Übernahme die Suchquelle. Folio führt die lokale Wahrheit.</small>
			</section>
		{:else}
			<section class="lead-strip" aria-label="Aktive Karriere-Leads">
				{#each active as lead (lead.lead_id)}
					<button class:selected={selected?.lead_id === lead.lead_id} onclick={() => (selectedId = lead.lead_id)}>
						<span>{stateLabel(lead)} · FIT {lead.fit_score}/10</span>
						<strong>{lead.title}</strong>
						<small>{lead.employer} · seit {elapsed(lead.high_fit_recorded_at)}</small>
					</button>
				{/each}
			</section>

			{#if selected}
				<article class:clarify={selected.decision === 'CLARIFY'} class="lead-card">
					<div class="lead-topline"><span>{stateLabel(selected)}</span><b>{selected.fit_score}<small>/10</small></b></div>
					<h1>{selected.title}</h1>
					<p class="employer">{selected.employer}</p>
					<div class="chips">
						{#if selected.location}<span>{selected.location}</span>{/if}
						{#if selected.workload}<span>{selected.workload}</span>{/if}
						{#if selected.contract_type}<span>{selected.contract_type}</span>{/if}
					</div>

					<section class="timing">
						<div><Clock3 size={17} /><span><small>Reaktionszeit</small><strong>{selected.submitted_at && selected.time_to_apply_ms !== null ? duration(selected.time_to_apply_ms) : elapsed(selected.high_fit_recorded_at)}</strong></span></div>
						<div><FileCheck2 size={17} /><span><small>Originalquelle</small><strong class:closed={selected.availability === 'CLOSED'}>{selected.availability}</strong></span></div>
					</section>
					<p class="checked">Zuletzt geprüft: {formatDate(selected.availability_checked_at)} · {selected.policy_version}</p>

					{#if selected.decision === 'CLARIFY'}
						<section class="clarify-box"><HelpCircle size={20} /><div><small>ENTSCHEIDENDE FRAGE</small><strong>{selected.clarify_question}</strong><span>Die Antwort geht zuerst als belegte Owner-Aussage in Memory; erst danach wird der Fit neu gerechnet.</span></div></section>
					{/if}

					<details class="evidence">
						<summary>Belege · {selected.strongest_facts.length}</summary>
						{#each selected.strongest_facts as fact}
							<div><Check size={15} /><span><strong>{fact.subject}</strong><small>{fact.value}</small></span></div>
						{/each}
					</details>

					<details class="requirements">
						<summary>Muss-Kriterien prüfen <ChevronDown size={16} /></summary>
						{#each selected.requirements.filter((item) => item.class === 'KNOCKOUT' || item.class === 'MUST') as item}
							<div><span class:proven={item.evidence_state === 'PROVEN'}>{item.evidence_state}</span><p>{item.text}</p></div>
						{/each}
					</details>

					<section class="next-step"><small>NÄCHSTER SCHRITT</small><strong>{selected.next_step}</strong></section>
					{#if selected.source_url}<a class="source-link" href={selected.source_url} target="_blank" rel="noreferrer">Originalanzeige öffnen <ExternalLink size={15} /></a>{/if}

					{#if !['submitted', 'declined', 'closed'].includes(selected.status)}
						{#if selected.status !== 'started'}
							<div class="quick-actions">
								{#if selected.status === 'unacknowledged' || selected.status === 'snoozed'}<button onclick={() => act('acknowledge')} disabled={saving || !data.canWrite}><Check size={16} /> Gesehen</button>{/if}
								<button onclick={() => act('snooze')} disabled={saving || !data.canWrite}><Pause size={16} /> 4 Std. später</button>
								{#if selected.decision !== 'CLARIFY'}<button class="primary" onclick={() => act('start_application')} disabled={saving || !data.canWrite || selected.availability !== 'OPEN'}><Play size={16} /> Bewerbung beginnen</button>{/if}
							</div>
						{/if}

						{#if selected.status === 'started'}
							<section class="terminal-action submitted">
								<div class="field-row"><label>Zeitpunkt<input type="datetime-local" bind:value={submittedAt} /></label><label>Weg<select bind:value={applicationChannel}><option value="portal">Portal</option><option value="email">E-Mail</option><option value="recruiter">Recruiter</option></select></label></div>
								<SlideToConfirm label={`Als am ${formatDate(new Date(submittedAt).toISOString())} eingereicht bestätigen`} hint="Bestätigt eine bereits erfolgte Bewerbung" disabled={!data.canWrite || selected.availability !== 'OPEN'} busy={saving} resetKey={`${selected.lead_id}:${selected.revision}:submitted`} onconfirm={() => act('confirm_submitted')} />
								<small>Folio protokolliert nur deine Aussage. Es wird nichts versendet oder hochgeladen.</small>
							</section>
						{/if}

						<button class="decline-toggle" onclick={() => (showDecline = !showDecline)}><X size={14} /> Lead nicht weiterverfolgen</button>
						{#if showDecline}
							<section class="terminal-action decline">
								<label>Grund<select bind:value={declineReason}><option value="not_interested">Kein Interesse</option><option value="conditions">Rahmenbedingungen</option><option value="timing">Timing</option><option value="duplicate">Doppelt</option><option value="other">Anderer Grund</option></select></label>
								<SlideToConfirm label={`Lead „${selected.title}“ als abgelehnt abschliessen`} hint="Schliesst den offenen Lead nachvollziehbar" disabled={!data.canWrite} busy={saving} resetKey={`${selected.lead_id}:${selected.revision}:decline`} onconfirm={() => act('decline')} />
							</section>
						{/if}
					{/if}

					<footer><ShieldCheck size={15} /><span>Menschliche Entscheidung und externe Bewerbung bleiben strikt getrennt.</span></footer>
				</article>
			{/if}

			{#if history.length > 0}
				<button class="history-toggle" onclick={() => (showHistory = !showHistory)}>Historie · {history.length} <ChevronDown size={16} /></button>
				{#if showHistory}<section class="lead-strip history">{#each history as lead}<button onclick={() => (selectedId = lead.lead_id)}><span>{stateLabel(lead)}</span><strong>{lead.title}</strong><small>{lead.employer}</small></button>{/each}</section>{/if}
			{/if}
		{/if}
	</main>
</div>

<style>
	:global(body) { background: hsl(210 25% 98.5%); }
	.career-mobile-root { --career: hsl(158 55% 34%); min-height: 100vh; max-width: 520px; margin: 0 auto; border-inline: 1px solid var(--color-border); background: var(--color-background); color: hsl(218 38% 12%); }
	.app-head { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px; padding: calc(10px + env(safe-area-inset-top)) 15px 10px; border-bottom: 1px solid var(--color-border); background: color-mix(in srgb, white 94%, transparent); backdrop-filter: blur(14px); }
	.app-head > a, .mark { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; color: inherit; }
	.mark { color: var(--career); background: hsl(155 35% 93%); }
	.app-head > div:nth-child(3) { display: flex; flex-direction: column; }
	.app-head strong { font-size: 15px; } .app-head span { color: var(--color-muted-foreground); font-size: 11px; }
	.app-head > b { margin-left: auto; padding: 5px 9px; border-radius: 999px; color: var(--career); background: hsl(155 35% 93%); font-size: 11px; }
	main { padding: 14px 12px calc(32px + env(safe-area-inset-bottom)); }
	.feedback { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; padding: 10px 12px; border-radius: 11px; color: hsl(156 42% 30%); background: hsl(150 38% 94%); font-size: 12px; }
	.feedback.error { color: hsl(3 55% 42%); background: hsl(0 70% 96%); }
	.empty { display: grid; justify-items: center; gap: 9px; min-height: 520px; place-content: center; padding: 28px; text-align: center; }
	.empty :global(svg) { color: var(--career); } .empty strong { font-size: 18px; } .empty p { max-width: 360px; margin: 0; color: var(--color-muted-foreground); font-size: 14px; line-height: 1.5; } .empty small { max-width: 340px; color: var(--color-muted-foreground); font-size: 10px; line-height: 1.4; }
	.lead-strip { display: grid; grid-auto-flow: column; grid-auto-columns: 82%; gap: 9px; overflow-x: auto; padding: 1px 1px 12px; scroll-snap-type: x mandatory; }
	.lead-strip button { scroll-snap-align: start; display: flex; flex-direction: column; gap: 3px; padding: 12px 13px; border: 1px solid var(--color-border); border-radius: 14px; color: inherit; background: var(--color-card); text-align: left; }
	.lead-strip button.selected { border-color: color-mix(in srgb, var(--career) 55%, var(--color-border)); box-shadow: 0 7px 20px hsl(158 30% 24% / .08); }
	.lead-strip span { color: var(--career); font-size: 9px; font-weight: 750; letter-spacing: .06em; } .lead-strip strong { font-size: 13px; } .lead-strip small { color: var(--color-muted-foreground); font-size: 10px; }
	.lead-card { padding: 18px 16px; border: 1px solid color-mix(in srgb, var(--career) 30%, var(--color-border)); border-radius: 20px; background: var(--color-card); box-shadow: 0 12px 32px hsl(210 24% 20% / .055); }
	.lead-card.clarify { --career: hsl(35 72% 42%); }
	.lead-topline { display: flex; align-items: center; color: var(--career); font-size: 10px; font-weight: 750; letter-spacing: .08em; }
	.lead-topline b { margin-left: auto; font-size: 26px; line-height: 1; } .lead-topline small { font-size: 11px; }
	h1 { margin: 12px 0 3px; font-size: 24px; line-height: 1.15; letter-spacing: -.035em; } .employer { margin: 0; color: var(--color-muted-foreground); font-size: 14px; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 13px 0; } .chips span { padding: 5px 8px; border-radius: 999px; color: var(--color-muted-foreground); background: var(--color-muted); font-size: 10px; }
	.timing { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 15px 0 7px; }
	.timing > div { display: flex; align-items: center; gap: 9px; padding: 11px; border-radius: 12px; background: hsl(210 26% 97%); }
	.timing :global(svg) { color: var(--career); } .timing span { display: flex; flex-direction: column; } .timing small { color: var(--color-muted-foreground); font-size: 9px; } .timing strong { font-size: 12px; } .timing strong.closed { color: hsl(3 58% 43%); }
	.checked { margin: 0 0 14px; color: var(--color-muted-foreground); font-size: 9px; }
	.clarify-box { display: flex; gap: 10px; padding: 13px; border-left: 3px solid var(--career); border-radius: 10px; color: hsl(35 66% 31%); background: hsl(38 82% 95%); }
	.clarify-box div { display: flex; flex-direction: column; gap: 4px; } .clarify-box small { font-size: 9px; letter-spacing: .06em; } .clarify-box strong { color: hsl(218 38% 12%); font-size: 13px; line-height: 1.4; } .clarify-box span { font-size: 10px; line-height: 1.4; }
	.evidence { margin: 18px 0; } .evidence summary { cursor: pointer; font-size: 12px; font-weight: 650; } .evidence > div { display: flex; gap: 8px; padding: 8px 0; border-top: 1px solid var(--color-border); } .evidence :global(svg) { flex: 0 0 auto; margin-top: 2px; color: var(--career); } .evidence span { display: flex; flex-direction: column; gap: 2px; } .evidence strong { font-size: 11px; } .evidence small { color: var(--color-muted-foreground); font-size: 10px; line-height: 1.4; }
	.requirements { border-block: 1px solid var(--color-border); padding: 11px 0; } .requirements summary { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 650; cursor: pointer; } .requirements > div { display: grid; grid-template-columns: 76px 1fr; gap: 8px; align-items: start; padding: 9px 0 0; } .requirements div > span { padding: 3px 5px; border-radius: 5px; color: hsl(35 68% 34%); background: hsl(38 75% 93%); font-size: 8px; text-align: center; } .requirements div > span.proven { color: hsl(156 44% 30%); background: hsl(150 38% 93%); } .requirements p { margin: 0; font-size: 10px; line-height: 1.4; }
	.next-step { display: flex; flex-direction: column; gap: 3px; margin: 15px 0; padding: 12px; border-radius: 11px; background: hsl(155 32% 95%); } .next-step small { color: var(--career); font-size: 9px; letter-spacing: .07em; } .next-step strong { font-size: 12px; line-height: 1.4; }
	.source-link { display: inline-flex; align-items: center; gap: 5px; color: var(--career); font-size: 11px; font-weight: 650; }
	.quick-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 18px 0 10px; } .quick-actions button { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; border: 1px solid var(--color-border); border-radius: 11px; color: inherit; background: white; font-size: 11px; font-weight: 650; } .quick-actions button.primary { grid-column: 1 / -1; border-color: var(--career); color: white; background: var(--career); } button:disabled { opacity: .45; cursor: not-allowed; }
	.terminal-action { display: grid; gap: 11px; margin-top: 13px; padding: 12px; border-radius: 14px; background: hsl(210 26% 97%); --slide-accent: var(--career); } .field-row { display: grid; grid-template-columns: 1.25fr .75fr; gap: 8px; } label { display: grid; gap: 4px; color: var(--color-muted-foreground); font-size: 9px; } input, select { min-width: 0; padding: 8px; border: 1px solid var(--color-border); border-radius: 8px; background: white; font: inherit; font-size: 10px; } .terminal-action > small { color: var(--color-muted-foreground); font-size: 9px; line-height: 1.4; }
	.decline-toggle { display: flex; align-items: center; gap: 5px; margin: 12px auto 0; border: 0; color: var(--color-muted-foreground); background: transparent; font-size: 10px; } .terminal-action.decline { --slide-accent: hsl(3 55% 43%); }
	.lead-card footer { display: flex; align-items: center; gap: 7px; margin-top: 17px; color: var(--color-muted-foreground); font-size: 9px; line-height: 1.4; }
	.history-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 14px; padding: 12px; border: 0; color: var(--color-muted-foreground); background: transparent; font-size: 11px; } .lead-strip.history { grid-auto-columns: 76%; }
	@media (max-width: 520px) { .career-mobile-root { border-inline: 0; } }
</style>
