import {describe,it,expect,vi} from 'vitest';
const data=vi.hoisted(()=>({rows:[] as any[]}));
vi.mock('./state.js',()=>({db:()=>({prepare:()=>({all:()=>data.rows})})}));
vi.mock('./accounts.js',()=>({accounts:()=>[{id:'gmail',kind:'imap'},{id:'yahoo',kind:'imap'}]}));
import {automaticMemorySourceEligibility,isExcludedMemoryFolder,savedMailLocations} from './mailbox-source.js';
describe('mail source scope',()=>{
 it('uses exact folder segments, preserving normal archives and sent mail',()=>{
  for(const f of ['Bulk','[Gmail]/Papierkorb','Junk E-mail','Trash'])expect(isExcludedMemoryFolder(f)).toBe(true);
  for(const f of ['Sent','Archive/2026','Job','Spam research'])expect(isExcludedMemoryFolder(f)).toBe(false);
 });
 it('resolves history namespace only to the bound configured account',()=>{
  data.rows=[{account:'gmail',folder:'INBOX',epoch:2,uid:41},{account:'other',folder:'INBOX',epoch:2,uid:42}];
  expect(savedMailLocations(1,'gmail-history')).toEqual([data.rows[0]]);expect(savedMailLocations(1,'yahoo-history')).toEqual([]);
 });
 it('excludes known spam/trash but preserves a known ordinary source location',()=>{
  data.rows=[{account:'yahoo',folder:'Bulk',epoch:2,uid:4}];expect(automaticMemorySourceEligibility(1,'yahoo-history')).toMatchObject({eligible:false,reason:'spam_or_trash_source'});
  data.rows.push({account:'yahoo',folder:'INBOX',epoch:2,uid:8});expect(automaticMemorySourceEligibility(1,'yahoo-history').eligible).toBe(true);
 });
 it('does not invent a spam verdict when no folder evidence exists',()=>{
  data.rows=[];expect(automaticMemorySourceEligibility(1,'gmail')).toMatchObject({eligible:true,reason:null});
 });
});
