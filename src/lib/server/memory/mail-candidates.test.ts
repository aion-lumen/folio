import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('mail-derived memory candidates', () => {
	let dir = '';

	afterEach(async () => {
		const llm = await import('../agent/llm.js');
		llm.setLlmOverride(null);
		const init = await import('../folio-db/init.js');
		init.resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	async function setup() {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db'));
		vi.resetModules();
		const init = await import('../folio-db/init.js');
		init.resetFolioDbForTests();
		init.getFolioDb();
		return {
			llm: await import('../agent/llm.js'),
			memory: await import('./store.js'),
			extractor: await import('./mail-candidates.js')
		};
	}

	const input = {
		feedback_id: 42,
		account_id: 'primary',
		imap_uid: 991,
		sender: 'sam@example.invalid',
		subject: 'Termin',
		body: 'Hallo Alex, Dienstag um 10 Uhr passt mir gut. Freundliche Grüsse, Sam',
		mail_domain: 'job',
		received_at: '2026-08-12T18:18:00+02:00'
	};

	it('does not turn an activation price or future debit into paid memory', async () => {
		const {extractor}=await setup();
		const fact={data_class:'transaction',subject:'Ticket',predicate:'paid',value:'63 EUR',sensitivity:'sensitive',evidence_quote:'Preis: 63,00 EUR',valid_from:'2026-09-13'};
		expect(()=>extractor.validateMailMemoryEnvelope({...input,mail_domain:'finance',body:'Ihr Abo wurde aktiviert. Preis: 63,00 EUR. Wir buchen monatlich ab.'},{schema:'folio/memory-candidate-proposals/v1',application:null,facts:[fact]})).toThrow(expect.objectContaining({reasonCode:'payment_not_explicit'}));
		for(const quote of ['Die Zahlung wurde nicht erhalten.','We will have paid tomorrow.','Der Betrag wird abgebucht.','Die Zahlung ist noch nicht eingegangen.'])expect(extractor.hasExplicitPaymentStatement(quote)).toBe(false);
		expect(extractor.hasExplicitPaymentStatement('Die Zahlung ist eingegangen.')).toBe(true);
	});
	it('repairs an invalid extraction once, without relaxing the quote check', async () => {
		const {llm,extractor}=await setup();let calls=0;
		llm.setLlmOverride(async()=>JSON.stringify({schema:'folio/memory-candidate-proposals/v1',application:null,facts:++calls===1?[{data_class:'context',subject:'Sam',predicate:'has_context',value:'Unsupported',sensitivity:'private',evidence_quote:'Never in source',valid_from:null}]:[]}));
		const result=await extractor.proposeMemoryFromMail(input);expect(calls).toBe(2);expect(result.facts).toHaveLength(0);
	});
	it('preserves a precise failure code when both attempts have an invented quote', async () => {
		const {llm,extractor}=await setup();let calls=0;
		llm.setLlmOverride(async()=>{calls++;return JSON.stringify({schema:'folio/memory-candidate-proposals/v1',application:null,facts:[{data_class:'context',subject:'Sam',predicate:'has_context',value:'Unsupported',sensitivity:'private',evidence_quote:'Never in source',valid_from:null}]});});
		await expect(extractor.proposeMemoryFromMail(input)).rejects.toMatchObject({reasonCode:'quote_not_in_source'});expect(calls).toBe(2);
	});
	it('keeps a dated candidate from a mail without a subject instead of failing its episode write', async () => {
		const {llm, extractor} = await setup();
		llm.setLlmOverride(async () => JSON.stringify({
			schema: 'folio/memory-candidate-proposals/v1', application: null,
			facts: [{data_class:'appointment', subject:'Sam', predicate:'scheduled_for',
				value:'Termin am 2026-09-16 um 10 Uhr.', sensitivity:'private',
				evidence_quote:'Termin am 2026-09-16 um 10 Uhr.', valid_from:'2026-09-16'}]
		}));
		const result=await extractor.proposeMemoryFromMail({...input, subject:'   ',
			body:'Termin am 2026-09-16 um 10 Uhr.', mail_domain:'kontakt'});
		expect(result.facts).toHaveLength(1);
		expect(result.facts[0].status).toBe('candidate');
		expect(result.bundle?.episodes).toHaveLength(1);
		expect(result.bundle?.episodes[0]).toMatchObject({title:'Ereignis aus einer E-Mail', occurred_at:'2026-09-16', status:'candidate'});
	});

	it('stores only externally derived candidates with an exact source quote', async () => {
		const { llm, memory, extractor } = await setup();
		llm.setLlmOverride(async () => JSON.stringify({
			schema: 'folio/memory-candidate-proposals/v1',
			application: null,
			facts: [{
				data_class: 'availability', subject: 'Alex', predicate: 'available_at',
				value: 'Alex is available Tuesday at 10:00.', sensitivity: 'private',
				evidence_quote: 'Dienstag um 10 Uhr passt mir gut.', valid_from: null
			}]
		}));

		const result = await extractor.proposeMemoryFromMail(input);
		expect(result).toEqual(expect.objectContaining({ domain: 'career', created: true }));
		expect(result.facts).toHaveLength(1);
		expect(result.facts[0]).toEqual(expect.objectContaining({
			status: 'candidate', derived_from_external: 1, source_kind: 'mail',
			source_ref: 'mail:primary:991', source_excerpt: 'Dienstag um 10 Uhr passt mir gut.'
		}));
		expect(memory.searchMemoryFacts('Dienstag', { domain: 'career', max_sensitivity: 'private' })).toEqual([]);
	});

	it('is idempotent for the same account and IMAP uid', async () => {
		const { llm, extractor } = await setup();
		let calls = 0;
		llm.setLlmOverride(async () => {
			calls += 1;
			return JSON.stringify({
				schema: 'folio/memory-candidate-proposals/v1',
				application: null,
				facts: [{
					data_class: 'availability', subject: 'Alex', predicate: 'available_at',
					value: 'Tuesday 10:00', sensitivity: 'private',
					evidence_quote: 'Dienstag um 10 Uhr passt mir gut.', valid_from: null
				}]
			});
		});
		expect((await extractor.proposeMemoryFromMail(input)).created).toBe(true);
		const replay = await extractor.proposeMemoryFromMail(input);
		expect(replay.created).toBe(false);
		expect(replay.facts).toHaveLength(1);
		expect(calls).toBe(1);
	});

	it('allows a rejected source package to be evaluated again', async () => {
		const { llm, memory, extractor } = await setup();
		let calls = 0;
		llm.setLlmOverride(async () => {
			calls += 1;
			return JSON.stringify({
				schema: 'folio/memory-candidate-proposals/v1', application: null,
				facts: [{
					data_class: 'availability', subject: 'Sam', predicate: 'available_at',
					value: 'Tuesday 10:00', sensitivity: 'private',
					evidence_quote: 'Dienstag um 10 Uhr passt mir gut.', valid_from: null
				}]
			});
		});
		const first = await extractor.proposeMemoryFromMail(input);
		memory.rejectMemoryProposalBundle(first.bundle!.proposal.proposal_id, 'owner');
		const retry = await extractor.proposeMemoryFromMail(input);
		expect(retry.created).toBe(true);
		expect(calls).toBe(2);
		expect(memory.listMemoryFactsBySource('career', 'mail:primary:991').map((fact) => fact.status)).toEqual([
			'rejected', 'candidate'
		]);
	});

	it('accepts an honest empty result without writing memory', async () => {
		const { llm, memory, extractor } = await setup();
		llm.setLlmOverride(async () => JSON.stringify({
			schema: 'folio/memory-candidate-proposals/v1', application: null, facts: []
		}));
		const result = await extractor.proposeMemoryFromMail({ ...input, subject: 'Job Alert' });
		expect(result.facts).toEqual([]);
		expect(memory.listMemoryFacts()).toEqual([]);
	});

	it('keeps calendar lifecycle notifications out of memory without calling the model', async () => {
		const { llm, memory, extractor } = await setup();
		const model = vi.fn();
		llm.setLlmOverride(model);

		const accepted = await extractor.proposeMemoryFromMail({
			...input,
			subject: 'Angenommen: Elternbesuchstage - Di 27. Okt. 2026',
			body: 'Alex hat diese Einladung angenommen. Titel: Elternbesuchstage'
		});
		const declinedWithAlternative = await extractor.proposeMemoryFromMail({
			...input,
			imap_uid: 992,
			subject: 'Re: Abgelehnt: Besichtigung - Di 19. Mai 2026',
			body: 'Der nächst mögliche Termin wäre am 27.05.2026 um 16:00 Uhr. Ni cK hat diese Einladung abgelehnt.'
		});
		const updated = await extractor.proposeMemoryFromMail({
			...input,
			imap_uid: 993,
			subject: 'Aktualisierte Einladung: Mathe Nachhilfe',
			body: 'Dieser Termin wurde aktualisiert. Organisator Alex. Gäste Robin. Einladung von Google Kalender.'
		});

		expect([accepted, declinedWithAlternative, updated].every((result) =>
			result.created && result.facts.length === 0 && result.bundle === null
		)).toBe(true);
		expect(model).not.toHaveBeenCalled();
		expect(memory.listMemoryFacts()).toEqual([]);
	});

	it('does not suppress an ordinary mail merely because its subject starts with Abgesagt', async () => {
		const { llm, extractor } = await setup();
		llm.setLlmOverride(async () => JSON.stringify({
			schema: 'folio/memory-candidate-proposals/v1', application: null,
			facts: [{
				data_class: 'commitment', subject: 'Raoul', predicate: 'committed_to',
				value: 'Liste der Genossenschafter prüfen', sensitivity: 'private',
				evidence_quote: 'Liste der Genossenschafter prüfen', valid_from: null
			}]
		}));
		const result = await extractor.proposeMemoryFromMail({
			...input,
			subject: 'Abgesagt: Delegierten',
			body: 'Bitte die Liste der Genossenschafter prüfen und die erste Lieferung vorbereiten.'
		});
		expect(result.facts).toHaveLength(1);
	});

	it('does not suppress a normal thread merely because quoted history contains an RSVP', async () => {
		const { llm, extractor } = await setup();
		llm.setLlmOverride(async () => JSON.stringify({
			schema: 'folio/memory-candidate-proposals/v1', application: null,
			facts: [{
				data_class: 'commitment', subject: 'Sam', predicate: 'committed_to',
				value: 'Unterlagen bis Freitag senden', sensitivity: 'private',
				evidence_quote: 'Unterlagen bis Freitag senden', valid_from: null
			}]
		}));
		const result = await extractor.proposeMemoryFromMail({
			...input,
			subject: 'Unterlagen zum Projekt',
			body: 'Bitte die Unterlagen bis Freitag senden.\n\n> Sam hat diese Einladung angenommen.'
		});
		expect(result.facts).toHaveLength(1);
	});

	it('rejects invented evidence and writes nothing', async () => {
		const { llm, memory, extractor } = await setup();
		llm.setLlmOverride(async () => JSON.stringify({
			schema: 'folio/memory-candidate-proposals/v1',
			application: null,
			facts: [{
				data_class: 'availability', subject: 'Alex', predicate: 'available_at',
				value: 'Wednesday 14:00', sensitivity: 'private',
				evidence_quote: 'Mittwoch um 14 Uhr passt mir.', valid_from: null
			}]
		}));
		await expect(extractor.proposeMemoryFromMail(input)).rejects.toMatchObject({reasonCode:'quote_not_in_source'});
		expect(memory.listMemoryFacts()).toEqual([]);
	});

	it('keeps a dated payment and its reconciliation identifiers as sensitive finance candidates', async () => {
		const { llm, memory, extractor } = await setup();
		const payment = {
			...input,
			mail_domain: 'finance',
			sender: 'service@paypal.example',
			subject: 'Beleg für Ihre Zahlung',
			body: 'Sie haben 17,40 EUR an Example Games gezahlt. Transaktionsdatum 16.08.2026. Bestellnummer 9876543210. Girokonto ••4207. Transaktionscode: ABC123.'
		};
		llm.setLlmOverride(async () => JSON.stringify({
			schema: 'folio/memory-candidate-proposals/v1',
			application: null,
			facts: [
				{
					data_class: 'transaction', subject: 'Alex Beispiel', predicate: 'paid',
					value: '17,40 EUR an Example Games gezahlt', sensitivity: 'private',
					evidence_quote: 'Sie haben 17,40 EUR an Example Games gezahlt.', valid_from: '2026-08-16'
				},
				{
					data_class: 'account_reference', subject: 'PayPal-Zahlung', predicate: 'identified_by',
					value: 'Girokonto ••4207; Transaktionscode ABC123', sensitivity: 'private',
					evidence_quote: 'Girokonto ••4207. Transaktionscode: ABC123.', valid_from: null
				},
				{
					data_class: 'context', subject: 'Alex Beispiel', predicate: 'has_context',
					value: 'Payment to Example Games for 17,40 EUR on 2026-08-16', sensitivity: 'private',
					evidence_quote: 'Sie haben 17,40 EUR an Example Games gezahlt.', valid_from: '2026-08-16'
				}
			]
		}));
		const result = await extractor.proposeMemoryFromMail(payment);
		expect(result.domain).toBe('finance');
		expect(result.facts).toHaveLength(3);
		expect(result.facts.every((fact) => fact.sensitivity === 'sensitive')).toBe(true);
		expect(result.facts[0].valid_from).toBe('2026-08-16');
		expect(result.facts.map((fact) => fact.value_text)).toEqual(expect.arrayContaining([
			'9876543210',
			'Girokonto ••4207; Transaktionscode ABC123'
		]));
		expect(result.bundle?.episodes).toHaveLength(1);

		memory.confirmMemoryProposalBundle(result.bundle!.proposal.proposal_id, 'owner');
		memory.tombstoneMemoryFact(result.facts[1].fact_id, 'owner');
		const retry = await extractor.proposeMemoryFromMail(payment);
		expect(retry.created).toBe(true);
		expect(retry.facts).toHaveLength(1);
		expect(retry.facts[0]).toEqual(expect.objectContaining({
			data_class: 'account_reference', status: 'candidate'
		}));
	});

	it('recovers explicit finance references when the model omits them', async () => {
		const { llm, extractor } = await setup();
		llm.setLlmOverride(async () => JSON.stringify({
			schema: 'folio/memory-candidate-proposals/v1',
			application: null,
			facts: [{
				data_class: 'transaction', subject: 'Example Games', predicate: 'paid',
				value: '17,40 EUR', sensitivity: 'private',
				evidence_quote: 'Sie haben 17,40 EUR an Example Games gezahlt.', valid_from: '2026-08-16'
			}]
		}));
		const result = await extractor.proposeMemoryFromMail({
			...input,
			mail_domain: 'finance',
			subject: 'Zahlungsbeleg',
			body: 'Sie haben 17,40 EUR an Example Games gezahlt. Bestellnummer: ORDER-123456. Transaktionscode TX-987654. Transaktionsdatum 16.08.2026.'
		});
		expect(result.facts.map((fact) => [fact.subject, fact.value_text])).toEqual([
			['Example Games', '17,40 EUR'],
			['Bestellnummer', 'ORDER-123456'],
			['Transaktionscode', 'TX-987654']
		]);
		expect(result.facts.every((fact) => fact.sensitivity === 'sensitive')).toBe(true);
	});

	it('keeps a concrete application acknowledgement, status, and named process contact', async () => {
		const { llm, extractor } = await setup();
		const application = {
			...input,
			sender: 'system@successfactors.example',
			subject: 'Bewerbung als Leitung Digitale Dienste beim Beispielkanton',
			body: 'Vielen Dank für die Bewerbungsunterlagen und das Interesse am Beispielkanton als Arbeitgeber. Die Bewerbungsunterlagen werden wir nun sorgfältig prüfen. Fragen zur Stelle und zum Prozess dürfen gern an recruiting@example.invalid gerichtet werden.'
		};
		llm.setLlmOverride(async () => JSON.stringify({
			schema: 'folio/memory-candidate-proposals/v1',
			application: {
				role: 'Leitung Digitale Dienste',
				organization: 'Beispielkanton',
				status: 'under_review',
				identity_quote: 'Bewerbung als Leitung Digitale Dienste beim Beispielkanton',
				status_quote: 'Die Bewerbungsunterlagen werden wir nun sorgfältig prüfen.',
				contact: {
					label: null,
					address: 'recruiting@example.invalid',
					evidence_quote: 'Fragen zur Stelle und zum Prozess dürfen gern an recruiting@example.invalid gerichtet werden.'
				}
			},
			facts: [{
				data_class: 'context', subject: 'Beispielkanton', predicate: 'has_context',
				value: 'Bewerbung als Leitung Digitale Dienste', sensitivity: 'private',
				evidence_quote: 'Bewerbung als Leitung Digitale Dienste beim Beispielkanton', valid_from: null
			}]
		}));

		const result = await extractor.proposeMemoryFromMail(application);
		expect(result.domain).toBe('career');
		expect(result.facts).toHaveLength(4);
		expect(result.facts.map((fact) => fact.predicate)).toEqual([
			'has_role', 'has_application_status', 'received_at', 'has_contact_address'
		]);
		expect(result.bundle?.entities.map((entity) => entity.entity_type)).toEqual(['application', 'organization', 'person']);
		expect(result.bundle?.relations.map((relation) => relation.relation_type)).toEqual(['application_at', 'contact_for']);
		expect(result.bundle?.episodes).toHaveLength(1);
		expect(result.facts[0]).toEqual(expect.objectContaining({ valid_from: '2026-08-12' }));
		expect(result.facts[1]).toEqual(expect.objectContaining({
			value_text: 'under_review', valid_from: '2026-08-12'
		}));
	});
});
