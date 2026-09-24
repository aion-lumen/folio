export const contractGroups = ['KI & Software','Lernen','Medien','Telefon & Internet','Hosting & Domains','Wohnen & Haushalt','Versicherungen','Mitgliedschaften','Bankkosten','Mobilität'] as const;
export type ContractStatus = 'observed' | 'uncertain' | 'cancelled';
export type ContractEvidence = { kind:'mail'|'bank'; id:string; sha256:string; label:string; date:string; note:string; valid?:boolean; href?:string };
export interface ContractItem {
 id:string; label:string; group:typeof contractGroups[number]; status:ContractStatus; priority:'high'|'normal'|'low';
 cost:string; summary:string; next_step:string; unknowns:string[];
 timing:null|{date:string; label:string; basis:'documented'|'estimated'|'review'};
 evidence:ContractEvidence[];
 help?:{label:string;url:string};
}
export interface ContractInventory {
 schema:'folio/contracts-inventory/v1'; as_of:string; batch_sha256:string;
 coverage:{mail_rows:number;mail_with_text:number;bank_entries:number;bank_through:string;accounts:string[];limitations:string[]};
 items:ContractItem[];
}
export const contractStatusLabels:Record<ContractStatus,string> = {observed:'Belege vorhanden',uncertain:'Status offen',cancelled:'Kündigung belegt'};
export function contractCounts(items:ContractItem[]) {return {all:items.length,high:items.filter(i=>i.priority==='high'&&i.status!=='cancelled').length,uncertain:items.filter(i=>i.status==='uncertain').length,cancelled:items.filter(i=>i.status==='cancelled').length};}
