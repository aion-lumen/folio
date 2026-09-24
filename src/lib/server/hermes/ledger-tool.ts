import type { ExecutionProfile } from '$lib/types/execution-profile.js';
import { isDemoVaultActive } from '../env.js';
import { hasModuleCapability } from '../modules/index.js';
import { mayUseLocalFinanceContext } from '../modules/ledger-books/intake.js';
import { readHouseholdContext } from '../modules/ledger-books/household.js';
import { ledgerQueryIntent, looksLikeLedgerQuestion, unsupportedLedgerScope, LEDGER_QUERY_HELP, queryLedgerHousehold, renderLedgerHousehold } from './ledger-query.js';
import { planLedgerQuery } from './ledger-planner.js';

/** A native read-only chat capability, handled before the general file agent.
 * Never sends financial data to a gateway or gives the model new file rights. */
export async function runLocalLedgerTool(message:string,history:{role:string;content:string}[],profile:ExecutionProfile,financeEnabled:boolean,now=new Date(),signal?:AbortSignal) {
 let intent=ledgerQueryIntent(message,history,now);
 if(!intent&&!looksLikeLedgerQuestion(message,history))return null;
 if(!mayUseLocalFinanceContext(financeEnabled,isDemoVaultActive(),profile)||!hasModuleCapability('ledger-books','batches.read'))return {text:'Die direkte Ledger-Abfrage ist in diesem Chat nicht freigegeben. Sie benötigt den privaten Vault, aktivierten Finanzkontext und ein verifiziert lokales Modell.'};
 if(unsupportedLedgerScope(message))return {text:/\bUSD\b|\bGBP\b|dollar/i.test(message)?'Die Abfrage verwendet die Währung des Haushaltsbuchs. Eine freie Währungsumrechnung ist hier noch nicht verfügbar; ich gebe deshalb keine andere Währung als die angefragte aus.':LEDGER_QUERY_HELP};
 let interpreted=false;
 if(!intent){
  try{intent=await planLedgerQuery(message,history,profile,now,signal);interpreted=true;}
  catch{if(signal?.aborted)throw signal.reason;return {text:'Ich konnte deine Frage mit dem lokalen Modell nicht zuverlässig in eine Ledger-Abfrage übersetzen. Bitte nenne beispielsweise „Cashflow Juli 2026“. Ich habe keine Dateisuche und keine Finanzänderung ausgeführt.'};}
 }
 if('clarification' in intent)return {text:intent.clarification};
 try {
  const context=readHouseholdContext();
  const requested=/\b(EUR|CHF)\b/i.exec(message)?.[1].toUpperCase();
  if(requested&&requested!==context.settings.currency)return {text:`Das Haushaltsbuch rechnet derzeit in ${context.settings.currency}. Eine Abfrage in ${requested} kann ich hier noch nicht korrekt ausgeben.`};
  const result={...queryLedgerHousehold(intent.query,context),interpretation:interpreted?'local_model':'direct'};
  return {name:'ledger.household_summary',args:{...intent.query},result,text:renderLedgerHousehold(result)};
 } catch {
  return {text:'Die Ledger-Daten konnten nicht vollständig geprüft werden. Ich kann deshalb keine belastbare Summe nennen. Bitte prüfe den Datenstand im Haushaltsbuch. Daraus folgt nicht, dass ein bestimmter Auszug fehlt.'};
 }
}
