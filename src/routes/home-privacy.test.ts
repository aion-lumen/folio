import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({vault:vi.fn(),mail:vi.fn(),reviewed:vi.fn(),runs:vi.fn(),pending:vi.fn(),stats:vi.fn(),scan:vi.fn(),archive:vi.fn(),metrics:vi.fn(),focus:vi.fn(),calendar:vi.fn(),sources:vi.fn(),demo:false}));
vi.mock('$lib/server/env.js',()=>({getVaultPath:m.vault,isDemoVaultActive:()=>m.demo}));
vi.mock('$lib/server/feedback/reader.js',()=>({getFeedbackRows:m.mail}));
vi.mock('$lib/server/folio-db/reader.js',()=>({getReviewedIds:m.reviewed,listRecentWorkerRuns:m.runs}));
vi.mock('$lib/server/inbox/scanner.js',()=>({countPendingInbox:m.pending,getInboxHubStats:m.stats,scanInboxForDisplay:m.scan}));
vi.mock('$lib/server/inbox/lead-ttl.js',()=>({archiveExpiredLeads:m.archive}));
vi.mock('$lib/server/leuchtfeuer/reader.js',()=>({readLeuchtfeuer:m.metrics}));
vi.mock('$lib/server/focus/store.js',()=>({loadFocus:m.focus}));
vi.mock('$lib/server/calendar/attention.js',()=>({calendarAttention:m.calendar}));
vi.mock('$lib/server/calendar/planning.js',()=>({sources:m.sources}));
import { load } from './+page.server.js';
beforeEach(()=>{
 vi.resetAllMocks();m.demo=false;m.vault.mockReturnValue('/synthetic-missing-vault');
 m.mail.mockReturnValue([{id:1,account_id:'private-account',sender:'private-sender',subject:'private-subject',domain:'job',actionability:'actionable',mail_date:new Date().toISOString()}]);
 m.reviewed.mockReturnValue(new Set());m.runs.mockReturnValue([{uuid:'private-run'}]);
 m.stats.mockResolvedValue({pending:3,awaiting_review:2,auto_committed:1});
 m.scan.mockResolvedValue({items:[{type:'lead',status:'valid',id:'private-lead',rolle:'private-role',quelle:'private-source',filename:'private-file',deadline:new Date(Date.now()+3600000).toISOString()}]});
 m.metrics.mockReturnValue({sites:[{site:'private-metrics'}]});m.focus.mockReturnValue({items:[{title:'private-focus'}],warning:''});
 m.calendar.mockResolvedValue({items:[{title:'private-calendar'}]});m.sources.mockReturnValue([{source_ref:'mail:private'}]);
});
it.each(['guest','member',undefined])('returns empty home data without reading or maintaining private sources for %s',async role=>{
 const data=await load({locals:{user:role?{role}:undefined}} as any);
 expect(data).toEqual({focus:{items:[],warning:''},calendarAttention:{items:[],syncedAt:null,unavailable:true},calendarSources:[],vaultPresent:false,inboxPending:0,inboxTriage:{awaiting_review:0,auto_committed:0},leads:[],mail:{total:0,unreviewed:0,unreviewedByAccount:{},triageTodayByDomain:{},triageTodayActionable:[]},lastRun:null,leuchtfeuer:{generatedFrom:null,stale:true,sites:[],verifiedThrough:null,github:null}});
 for(const reader of Object.values(m).filter(vi.isMockFunction))expect(reader).not.toHaveBeenCalled();
});
it('retains private home data for the owner',async()=>{
 const data=await load({locals:{user:{role:'owner'}}} as any);
 expect(data).toMatchObject({leads:[{rolle:'private-role',filename:'private-file'}],mail:{total:1,unreviewedByAccount:{'private-account':1},triageTodayActionable:[{subject:'private-subject'}]},inboxPending:3,lastRun:{uuid:'private-run'},focus:{items:[{title:'private-focus'}]},calendarSources:[{source_ref:'mail:private'}]});
 expect(m.archive).toHaveBeenCalledOnce();
});
