import {mkdtempSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {documentBytes,isolatedProcess,privateDirectory,readSecurityConfig,securityRoot} from '../../file-intake/document-security.js';

let active=0;
/** Called only after householdDocument has revalidated the exact original. */
export async function householdPreview(bytes:Buffer,page:number){
 if(!Number.isSafeInteger(page)||page<1||page>500)throw Error('invalid_page');
 if(active>=2)throw Error('preview_busy');
 const config=readSecurityConfig();if(!config)throw Error('preview_unavailable');
 const jobs=join(securityRoot(),'jobs');privateDirectory(jobs);
 const work=mkdtempSync(join(jobs,'household-preview-'));active++;
 try{
  writeFileSync(join(work,'input.pdf'),bytes,{mode:0o600,flag:'wx'});
  const python=realpathSync(config.python_bin),helper=resolve('scripts/render-household-document.py');
  const result=await isolatedProcess(python,['-I',helper,String(page)],work,[helper,dirname(dirname(python))],15000,16384);
  if(result.code!==0)throw Error('preview_failed');
  const pages=JSON.parse(result.stdout).pages;
  if(!Number.isSafeInteger(pages)||pages<page||pages>500)throw Error('preview_invalid');
  const image=documentBytes(join(work,'page.jpg'),8*1024*1024);
  if(image[0]!==0xff||image[1]!==0xd8)throw Error('preview_invalid');
  return {bytes:image,pages};
 }finally{active--;rmSync(work,{recursive:true,force:true});}
}
