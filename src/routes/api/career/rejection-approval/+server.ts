import { error, json } from '@sveltejs/kit';
import { isDemoVaultActive } from '$lib/server/env.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import { approvalView, rejectionApprovals } from '$lib/server/career/rejection-approval.js';
import type { RequestHandler } from './$types.js';

export const POST:RequestHandler=async({request,url,locals})=>{
 if(locals.user.role!=='owner'||isDemoVaultActive())throw error(403,'Private Owner-Freigabe erforderlich');
 requireModuleCapability('career','events.write');
 if(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json'))throw error(403,'Freigabe bitte direkt in Folio ausführen');
 let body:unknown;try{body=await request.json();}catch{throw error(400,'Ungültige Freigabe');}
 if(!body||typeof body!=='object'||!['action,id','action,confirmedFeedbackIds,id'].includes(Object.keys(body).sort().join(',')))throw error(400,'Ungültige Freigabe');
 const {action,id,confirmedFeedbackIds=[]}=body as {action:unknown;id:unknown;confirmedFeedbackIds?:unknown};
 if(!Array.isArray(confirmedFeedbackIds)||confirmedFeedbackIds.length>100||confirmedFeedbackIds.some(id=>!Number.isSafeInteger(id)||id<1))throw error(400,'Ungültige Zuordnungsbestätigung');
 if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)||!['preview','approve'].includes(String(action)))throw error(400,'Ungültige Freigabe');
 try {
  const store=rejectionApprovals();
  const plan=action==='approve'?store.apply(id,`owner:${locals.user.id}`,confirmedFeedbackIds):store.get(id);
  return json(approvalView(plan),{headers:{'cache-control':'no-store'}});
 }catch(cause){
  const code=cause instanceof Error?cause.message:'';
  if(code==='tracker_changed'||code==='position_changed')throw error(409,'Carta wurde inzwischen geändert. Bitte den Absagenabgleich erneut starten.');
  if(code==='mail_evidence_changed')throw error(409,'Die Mailquelle hat sich geändert. Bitte erneut abgleichen.');
  if(code==='identity_confirmation_required')throw error(409,'Bitte zuerst die Zuordnung der gekennzeichneten Mail zur Bewerbung bestätigen.');
  if(code==='approval_expired')throw error(409,'Diese Freigabe ist abgelaufen. Bitte erneut abgleichen.');
  throw error(409,'Die Änderung wurde nicht bestätigt. Bitte erneut prüfen; vorhandene Einträge bleiben erhalten.');
 }
};
