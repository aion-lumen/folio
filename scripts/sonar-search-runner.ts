import { readSonarSearchRunStatus, startSonarSearchRun, SonarSearchBusyError } from '../src/lib/server/modules/sonar/search-runner.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Scheduled and mobile searches share the exact same lock, logs and result status.
async function main() {
 const runnerPath = process.env.FOLIO_SONAR_SEARCH_RUNNER;
 if (!runnerPath) throw new Error('FOLIO_SONAR_SEARCH_RUNNER is required');
 const config = { runnerPath, stateRoot: join(homedir(), '.folio', 'sonar-search') };
 try { startSonarSearchRun(config); }
 catch (error) { if (!(error instanceof SonarSearchBusyError)) throw error; }
 let status = readSonarSearchRunStatus(config);
 while (status.state === 'running') {
  await new Promise(resolve => setTimeout(resolve, 1000));
  status = readSonarSearchRunStatus(config);
 }
 if (status.state !== 'completed') throw new Error(status.state === 'failed' ? status.message ?? 'Search failed' : 'Missing search result');
 const s = status.summary;
 process.stdout.write(JSON.stringify({queries:s.queries,fetched:s.fetched,liked:s.liked,bookmarked:s.bookmarked,searched:s.searched,eligible:s.eligible,selected:s.selected,created:s.created,acquisition:s.acquisition,acquiredAt:s.acquiredAt,notification:s.notification})+'\n');
}
async function notifyFailure() {
 try {
  const configPath=process.env.FOLIO_SONAR_SEARCH_CONFIG;
  if (!configPath) return;
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  const n=config.notification;if(!n)return;
  const receipt=join(homedir(),'.folio','sonar-search','failure-notified.json');
  const day=new Date().toISOString().slice(0,10);
  if(existsSync(receipt)&&JSON.parse(readFileSync(receipt,'utf8')).day===day)return;
  const token=readFileSync(n.token_file,'utf8').trim();
  const response=await fetch(n.endpoint,{method:'POST',signal:AbortSignal.timeout(5000),headers:{Authorization:`Bearer ${token}`,Title:'Sonar: Suchlauf pruefen',Click:n.review_url},body:'Der Sonar-Suchlauf ist fehlgeschlagen. Den Status findest du in Folio.'});
  if(response.ok)writeFileSync(receipt,JSON.stringify({day}),{mode:0o600});
 }catch{/* Status and private log remain available if notification delivery also fails. */}
}
main().catch(async error => { console.error('Sonar:', error.message); await notifyFailure(); process.exitCode=1; });
