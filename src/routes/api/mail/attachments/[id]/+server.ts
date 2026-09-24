import { json,error } from '@sveltejs/kit';
import { attachmentSummary } from '$lib/server/mail-intake/attachments.js';
import type { RequestHandler } from './$types.js';
export const GET:RequestHandler=({params})=>{
 if(!/^[1-9]\d*$/.test(params.id))throw error(400,'Ungültige Mail-ID');
 try{return json(attachmentSummary(Number(params.id)),{headers:{'Cache-Control':'private, no-store'}});}
 catch{return json({check:null,items:[],unavailable:true},{headers:{'Cache-Control':'private, no-store'}});}
};
