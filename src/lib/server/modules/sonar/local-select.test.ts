import {describe,it,expect} from 'vitest';
import {selectLocalJson} from '../../../../../scripts/sonar-local-select.mjs';
describe('Local JSON selection',()=>{
 it('uses only the loopback model with no tool capability and bounded structured output',async()=>{
  const text=await selectLocalJson('local-test','public posts',async(url:any,options:any)=>{
   expect(url).toBe('http://127.0.0.1:1234/v1/chat/completions');
   const body=JSON.parse(options.body);expect(body.reasoning_effort).toBe('none');expect(body.tools).toBeUndefined();expect(body.max_tokens).toBe(1800);expect(body.response_format.type).toBe('json_schema');
   return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"schema":"folio/sonar-placement-selection/v1","selections":[]}'}}]}));
  });expect(JSON.parse(text).selections).toEqual([]);
 });
 it('rejects reasoning-only and truncated output rather than calling that an empty result',async()=>{
  await expect(selectLocalJson('local-test','posts',async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'',reasoning_content:'unfinished'}}]})))).rejects.toThrow('incomplete');
 });
});

it('accepts only complete schema JSON from a mislabelled MLX response field',async()=>{
 const json='{"schema":"folio/sonar-placement-selection/v1","selections":[]}';
 const response=(value:string)=>async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'',reasoning_content:value}}]}));
 expect(await selectLocalJson('local-test','posts',response(json))).toBe(json);
 await expect(selectLocalJson('local-test','posts',response('Let me think. '+json))).rejects.toThrow('missing structured');
});
