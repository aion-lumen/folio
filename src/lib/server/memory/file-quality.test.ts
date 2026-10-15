import {describe,it,expect} from 'vitest';
import {archiveSourceDate,assessArchiveFact,archiveMetadataOnly,type ArchiveFact} from './file-quality.js';
const fact=(value:string,claim_kind='event'):ArchiveFact=>({subject:'Projekt Morgenlicht',predicate:'has_context',data_class:'context',value,quote:value,claim_kind});
describe('archive evidence quality',()=>{
 it.each([
  ['# Audit-Ergebnis Datum: 2024-03-01','[Page 1]\n# Audit-Ergebnis\nDatum: 2024-03-01\nDas Archiv speichert Originaldateien lokal.'],
  ['Datum: 01.08.2024 Uhrzeit: vonbis Anzahl Teilnehmer: 6-7','[Page 1]\nAktivitätsplanung\nDatum: 01.08.2024\nUhrzeit:\nvonbis\nAnzahl Teilnehmer: 6-7\nThema: Malen mit Naturmaterialien.']
 ])('holds header-only metadata: %s',(value,text)=>{
  expect(archiveMetadataOnly(value,text)).toBe(true);
  expect(assessArchiveFact(fact(value),text,'2026-10-14').hold).toBe('transient_or_low_value');
 });
 it('preserves a substantive topic or rule and does not truncate a mixed excerpt',()=>{
  expect(archiveMetadataOnly('Thema: Malen mit Naturmaterialien.','[Page 1]\nAktivitätsplanung\nDatum: 2024-03-01\nThema: Malen mit Naturmaterialien.')).toBe(false);
  const value='Pro Anfrage werden Kennung und Dauer protokolliert.';
  expect(archiveMetadataOnly(value,'[Page 1]\n'+value)).toBe(false);
  expect(archiveMetadataOnly('Datum: 2024-03-01 Das Archiv speichert Originaldateien lokal.','[Page 1]\nAudit\nDatum: 2024-03-01\nDas Archiv speichert Originaldateien lokal.')).toBe(false);
 });
 it.each(['The licensee shall pay the fee annually.','Der Mieter soll die Wohnung pfleglich behandeln.','Der Vertrag wird auf ein Jahr abgeschlossen.','Ziel der Vereinbarung ist die Archivierung aller Belege.','Die Parteien werden Streitigkeiten zunächst intern besprechen.'])('preserves a normative rule with modal wording: %s',value=>{
  for(const text of ['Stand: 2024-01-01\n'+value,'Vereinbarung\n'+value]){
   const result=assessArchiveFact(fact(value,'rule'),text,'2026-10-14');
   expect(result.hold).toBeNull();
   expect(result.evidence).toMatchObject({claim_kind:'rule',predicate:'has_context',data_class:'context',raw_value:value});
   expect(result.evidence?.value).not.toContain('damaliger Plan');
  }
 });
 it.each(['Wir beabsichtigen, eine Archivpflicht zu vereinbaren.','We plan to introduce an archive policy.','Die Firma plant die Einführung einer Archivpflicht.'])('holds explicit intentions wrongly labelled as a rule: %s',value=>{
  for(const text of ['Stand: 2024-01-01\n'+value,'Notiz\n'+value])expect(assessArchiveFact(fact(value,'rule'),text,'2026-10-14').hold).toBe('historical_context_missing');
 });
 it.each(['Der geplante Umzug nach Bern erfolgt im Herbst.','Die Firma plant die Einführung von SAP.','Ich werde das Haus 2025 vermieten.','We plan to migrate in Q3.','The team intends to migrate.','We will migrate in 2027.','Das Haus soll vermietet werden.'])('does not accept an intention mislabelled as event: %s',value=>{
  expect(assessArchiveFact(fact(value,'event'),'Notiz','2026-10-14').hold).toBe('historical_context_missing');
  expect(assessArchiveFact(fact(value,'event'),'Stand: 2024-01-01','2026-10-14').evidence).toMatchObject({claim_kind:'plan',data_class:'context',predicate:'has_context'});
 });
 it('requires temporal evidence for an event and keeps it as context',()=>{
  expect(assessArchiveFact(fact('Das Archiv wurde eröffnet.'),'Projektliste','2026-10-14').hold).toBe('historical_context_missing');
  const dated=assessArchiveFact({...fact('Das Archiv wurde 2021 eröffnet.'),data_class:'project_fact',predicate:'documents_project'},'Projektliste','2026-10-14');
  expect(dated.evidence).toMatchObject({source_date:null,event_date_quote:'2021',data_class:'context',predicate:'has_context'});
  expect(assessArchiveFact(fact('Der Umzug erfolgt am 2027-04-01.'),'Stand: 2024-03-01','2026-10-14').hold).toBe('historical_context_missing');
  expect(assessArchiveFact(fact('Die Eröffnung fand am 2024-02-31 statt.'),'Stand: 2024-03-01','2026-10-14').hold).toBe('historical_context_missing');
 });
 it('reads a bounded contiguous document header, not body dates or future dates',()=>{
  for(const text of ['Projektliste\nMeilenstein 3\nDatum: 2026-12-31','Titel\nDies ist der Fliesstext.\nDate: 2019-01-01','Stand: 2026-10-15','Stand: 2024-01-01\nDate: 2027-01-01','Titel\nAutor: Mira\nVersion: 1\nProjekt: Orion\nTitel: Bericht\nStand: 2024-01-01'])expect(archiveSourceDate(text,'2026-10-14').date).toBeNull();
  expect(archiveSourceDate('[Page 1]\nProjektliste\nAutor: Mira\nStand: 2024-01-01\nDies ist der Fliesstext.\nDate: 2019-01-01','2026-10-14').date).toBe('2024-01-01');
 });
 it('keeps a dated intention as a source-attributed plan, never a current preference',()=>{
  const r=assessArchiveFact({...fact('Ich möchte das Atelier verkaufen.','state'),predicate:'has_profile_fact',data_class:'profile'},'[Page 1]\nStand: 2024-02-03\nIch möchte das Atelier verkaufen.');
  expect(r.evidence).toMatchObject({claim_kind:'plan',source_date:'2024-02-03',predicate:'has_context',data_class:'context'});
  expect(r.evidence?.value).toContain('damaliger Plan; Umsetzung nicht belegt');
 });
 it('holds undated intentions and temporary states instead of inventing a date',()=>{
  expect(assessArchiveFact(fact('Geplant ist der Verkauf.','event'),'Dateiname 2026-10-14.md').hold).toBe('historical_context_missing');
  expect(assessArchiveFact(fact('Das Konto ist gesperrt.','state'),'Frist 2027-01-01').hold).toBe('historical_context_missing');
 });
 it('preserves a documented contractual rule without turning it into a future plan or current commitment',()=>{
  const r=assessArchiveFact({...fact('Für Objekt Orion ist eine Bearbeitungsgebühr von 75 EUR vereinbart.','rule'),predicate:'committed_to',data_class:'commitment'},'Stand: 2024-03-01');
  expect(r.evidence).toMatchObject({claim_kind:'rule',predicate:'has_context',data_class:'context'});
  expect(r.evidence?.value).toContain('dokumentierte Regel; heutige Gültigkeit ungeprüft');
  expect(r.evidence?.value).not.toContain('Umsetzung nicht belegt');
 });
 it.each(['PID: 17723','process_id=204','duration_ms: 654','"name": "demo-app"','"version": "2.0.1"','Bitte führe npm install aus.'])('holds ephemeral material even if a model calls it durable: %s',value=>{
  expect(assessArchiveFact(fact(value,'rule'),'Stand: 2026-10-14').hold).toBe('transient_or_low_value');
 });
 it('retains useful history and architecture without claiming present validity',()=>{
  const history=assessArchiveFact(fact('Das Projekt wurde von 2020 bis 2022 betrieben.'),'Projektübersicht');
  expect(history.evidence?.value).toContain('Quellendatum unbekannt; dokumentiertes Ereignis');
  const rule=assessArchiveFact(fact('Pro Anfrage werden Kennung und Dauer protokolliert; Inhalte bleiben ausgelassen.','rule'),'Architektur');
  expect(rule.hold).toBeNull();expect(rule.evidence?.value).toContain('heutige Gültigkeit ungeprüft');
 });
 it('requires a real explicit date and refuses conflicting headers',()=>{
  expect(archiveSourceDate('Stand: 2025-02-30').date).toBeNull();
  expect(archiveSourceDate('Datum: 03.02.2024').date).toBe('2024-02-03');
  expect(archiveSourceDate('Stand: 2024-02-03\nDate: 2025-01-01').date).toBeNull();
  expect(archiveSourceDate('Stand: 2024-02-03\nStand: 2024-02-03').date).toBe('2024-02-03');
  expect(archiveSourceDate('Import 2026-10-14, Termin am 2027-01-01').date).toBeNull();
 });
});
