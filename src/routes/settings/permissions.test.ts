import {it,expect} from 'vitest';
import {load,actions} from './+page.server.js';
it('keeps calendar settings owner-only',async()=>{await expect((load as Function)({locals:{user:{role:'council_member'}}})).rejects.toMatchObject({status:403});for(const f of Object.values(actions))await expect((f as Function)({locals:{user:{role:'council_member'}}})).rejects.toMatchObject({status:403});});
