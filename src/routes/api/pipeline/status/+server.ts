import {error,json} from '@sveltejs/kit';
import {pipelineSnapshot} from '$lib/server/mail-intake/pipeline-status.js';
import type {RequestHandler} from './$types.js';
export const GET:RequestHandler=({locals})=>{
 if(locals.user.role!=='owner')throw error(403,'Owner access required');
 const {busy,label}=pipelineSnapshot();
 return json({busy,label},{headers:{'Cache-Control':'private, no-store'}});
};
