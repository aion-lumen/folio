import { error } from '@sveltejs/kit';
import { attachmentDownload } from '$lib/server/mail-intake/attachments.js';
import type { RequestHandler } from './$types.js';
export const GET:RequestHandler=({params})=>{
 if(!/^[1-9]\d*$/.test(params.id)||!/^[a-f0-9]{64}$/.test(params.attachment))throw error(400,'Ungültiger Anhang');
 try{
  const file=attachmentDownload(Number(params.id),params.attachment);
  return new Response(new Uint8Array(file.bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Anhang.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/'/g,'%27')}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
 }catch{throw error(409,'Anhang nicht verfügbar oder Prüfnachweis ungültig.');}
};
