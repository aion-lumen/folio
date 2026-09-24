import {it,expect} from 'vitest';
import {POST,GET as START} from './connect/+server.js';
import {GET} from './callback/+server.js';
import {load,actions} from './+page.server.js';
it('rejects non-owner calendar reads',async()=>{await expect((load as Function)({locals:{user:{role:'council_member'}}})).rejects.toMatchObject({status:403});});
it('rejects non-owner OAuth endpoints',async()=>{for(const f of [POST,START,GET])await expect((f as Function)({locals:{user:{role:'council_member'}}})).rejects.toMatchObject({status:403});});
it('rejects non-owner mutations before parsing data',async()=>{for(const f of Object.values(actions))await expect((f as Function)({locals:{user:{role:'council_member'}}})).rejects.toMatchObject({status:403});});
