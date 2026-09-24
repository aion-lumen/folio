import {error} from '@sveltejs/kit';
import {requireModuleCapability} from '$lib/server/modules/http.js';
import {householdDocument} from '$lib/server/modules/ledger-books/household-evidence.js';
import {householdPreview} from '$lib/server/modules/ledger-books/household-preview.js';
import type {RequestHandler} from './$types.js';
export const GET:RequestHandler=async({locals,params,url})=>{
 if(locals.user.role!=='owner')error(403,'Nur für den Eigentümer verfügbar.');
 requireModuleCapability('ledger-books','batches.read');
 try{const file=householdDocument(params.id,url.searchParams.get('batch')??'',params.kind,params.digest);
  if(url.searchParams.get('preview')==='1'){
   const preview=await householdPreview(file.bytes,Number(url.searchParams.get('page')??1));
   return new Response(new Uint8Array(preview.bytes),{headers:{'content-type':'image/jpeg','cache-control':'private, no-store','x-content-type-options':'nosniff','x-document-pages':String(preview.pages),'content-security-policy':"default-src 'none'",'referrer-policy':'no-referrer'}});
  }
  return new Response(new Uint8Array(file.bytes),{headers:{'content-type':'application/pdf','content-disposition':`${url.searchParams.get('download')==='1'?'attachment':'inline'}; filename="${file.filename}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'",'referrer-policy':'no-referrer'}});
 }catch{error(409,'Beleg nicht verfügbar oder Prüfnachweis verändert.');}
};
