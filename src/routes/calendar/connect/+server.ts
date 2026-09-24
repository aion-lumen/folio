import {error,redirect} from '@sveltejs/kit';
import {begin} from '$lib/server/calendar/google.js';
import {guard} from '$lib/server/calendar/store.js';
import type {RequestHandler} from './$types.js';
export const POST:RequestHandler=async({locals,cookies,request,url})=>{if(locals.user.role!=='owner')throw error(403);guard();const f=await request.formData(),b=begin(f.get('write')==='yes');cookies.set('folio-calendar-oauth',b.nonce,{path:'/calendar',httpOnly:true,sameSite:'lax',secure:url.protocol==='https:',maxAge:600});throw redirect(303,b.url);};

// OAuth starts with browser navigation; the callback remains bound to state + HttpOnly cookie + PKCE.
export const GET:RequestHandler=async({locals,cookies,url})=>{if(locals.user.role!=='owner')throw error(403);guard();const b=begin(url.searchParams.get('write')==='yes');cookies.set('folio-calendar-oauth',b.nonce,{path:'/calendar',httpOnly:true,sameSite:'lax',secure:url.protocol==='https:',maxAge:600});throw redirect(303,b.url);};
