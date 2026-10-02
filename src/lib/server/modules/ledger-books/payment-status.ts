import { dirname,join } from 'node:path';
import { getFolioDbPath } from '../../env.js';
import { atomicPrivateJson,documentBytes } from '../../file-intake/document-security.js';
import { canonicalHash } from './reconciliation.js';
export interface PaymentIssue {fact_id:string;fact_sha256:string;month:string;reason:string;created_at:string;}
const path=()=>join(dirname(getFolioDbPath()),'payment-agent','issues.json');
export function paymentIssues():PaymentIssue[]{try{return JSON.parse(documentBytes(path(),2*1024*1024).toString());}catch{return [];}}
export function savePaymentIssue(fact:{fact_id:string;valid_from:string|null},reason:string){
 const rows=paymentIssues().filter(r=>r.fact_id!==fact.fact_id);
 rows.push({fact_id:fact.fact_id,fact_sha256:canonicalHash(fact),month:fact.valid_from?.slice(0,7)??'',reason,created_at:new Date().toISOString()});atomicPrivateJson(path(),rows);
}
export function clearPaymentIssue(id:string){atomicPrivateJson(path(),paymentIssues().filter(r=>r.fact_id!==id));}
export const paymentQuestions:Record<string,string>={
 payment_transfer_direction_unproven:'Ist diese Übertragung auf dein Konto eingegangen oder davon abgegangen?',
 payment_context_only:'Vertragsinformation im Gedächtnis einordnen',
 source_date_or_bank_reference_required:'Für welchen Zeitraum gilt dieser Beleg? Eine passende Bankreferenz fehlt.',
 payment_paypal_statement_required:'Für diese Zahlung fehlt der PayPal-Umsatznachweis.',
 payment_card_statement_required:'Für diese Zahlung fehlt die Kartenabrechnung.',
 payment_broker_statement_required:'Für diesen Vorgang fehlt der Broker- oder Depotauszug.',
 payment_account_coverage_missing:'Für diese Währung fehlt ein passender Kontoauszug.',
 payment_currency_missing:'In welcher Währung wurde dieser Betrag bezahlt?',
 payment_currency_unproven:'Welche Währung nennt der Originalbeleg?',
 payment_claim_invalid:'Die Zahlungsangaben konnten nicht vollständig gelesen werden. Bitte den Originalbeleg prüfen.',
 source_preparation_failed:'Der Beleg konnte nicht verarbeitet werden. Bitte erneut einlesen.',
 payment_date_ambiguous:'Welche der Datumsangaben gehört zu dieser Zahlung?',
 payment_window_invalid:'Welcher Zahlungszeitraum gehört zu diesem Beleg?',
 multiple_original_payments:'Zu welchem der ursprünglichen Käufe gehört diese Erstattung?',
 payment_amount_unproven:'Welcher Betrag gehört zu diesem Beleg?',
 payment_claim_quote_missing:'Welche fehlende Angabe lässt sich am Originalbeleg ergänzen?',
 payment_claim_incomplete:'Welches Konto und welcher Betrag gehören zu diesem Beleg?',
 payment_counterparty_unproven:'Wer ist der Zahlungsempfänger oder Absender?',
 payment_excerpt_unbound:'Welche Stelle im Original belegt diese Zahlungsangabe?',
 payment_date_unproven:'Für welchen Monat gilt dieser Beleg?',
 partial_or_amount_mismatch:'Ist dies eine Teilzahlung oder gehört die Buchung zu einem anderen Beleg?',
 partial_collective_or_reversal:'Welche Belege gehören zu dieser Teil- oder Sammelzahlung?',
 direction_or_reversal_mismatch:'Gehört die Gegenbuchung zu einer Erstattung oder Rücklastschrift?',
 multiple_plausible_matches:'Welche der gleich hohen Buchungen gehört zu diesem Beleg?',
};
