/** Separate processing state from a person's review mark and IMAP flags. */
export type MailWorkState = 'decision' | 'automatic' | 'technical' | 'inbox';
export interface MailWorkStatus { state:MailWorkState; reason:string; href?:string; receiptId?:string; }
export const MAIL_WORK_LABELS:Record<MailWorkState,string>={decision:'Deine Entscheidung',automatic:'Automatisch bearbeitet',technical:'Technisch nachzuholen',inbox:'Weiterer Posteingang'};
