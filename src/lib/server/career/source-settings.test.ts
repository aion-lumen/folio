import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {careerTrackerAvailability,readCartaTracker} from './carta-tracker.js';
let dir:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'career-config-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));vi.stubEnv('FOLIO_CAREER_TRACKER_PATH','');});
afterEach(()=>{vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
it('distinguishes missing configuration from a legitimately empty tracker',()=>{expect(careerTrackerAvailability().status).toBe('unconfigured');expect(()=>readCartaTracker()).toThrow('career_tracker_not_configured');const tracker=join(dir,'tracker.html');writeFileSync(tracker,'const DATA=[];\nconst REJECTED=[];');writeFileSync(join(dir,'career-settings.json'),JSON.stringify({trackerPath:tracker}));expect(careerTrackerAvailability()).toMatchObject({status:'ready',snapshot:{positions:[],rejected:[]}});});
it('does not hide missing or invalid sources as empty successful results',()=>{vi.stubEnv('FOLIO_CAREER_TRACKER_PATH',join(dir,'missing.html'));expect(careerTrackerAvailability().status).toBe('missing');expect(()=>readCartaTracker()).toThrow();vi.stubEnv('FOLIO_CAREER_TRACKER_PATH','relative.html');expect(careerTrackerAvailability().status).toBe('invalid');vi.stubEnv('FOLIO_CAREER_TRACKER_PATH','');writeFileSync(join(dir,'career-settings.json'),'{');expect(careerTrackerAvailability().status).toBe('invalid');});
