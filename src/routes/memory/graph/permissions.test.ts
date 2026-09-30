import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server.js';
import { load as memoryEntry, actions } from '../+page.server.js';
import { load as memoryLayout } from '../+layout.server.js';
import { buildMemoryGraph } from '$lib/server/memory/graph.js';

vi.mock('$lib/server/memory/graph.js', () => ({ buildMemoryGraph: vi.fn(() => ({ nodes: [], edges: [] })) }));

describe('Memory graph access', () => {
	beforeEach(() => vi.clearAllMocks());
	it.each(['council_member', 'guest', undefined])('denies %s before reading the graph', async (role) => {
		const event = { locals: { user: role ? { role } : undefined } };
		for (const loader of [load, memoryLayout]) {
			expect(() => (loader as Function)(event)).toThrow(expect.objectContaining({ status: 403 }));
		}
		await expect((memoryEntry as Function)(event)).rejects.toMatchObject({status:403});
		for (const action of Object.values(actions)) expect((await action!(event as any))?.status).toBe(403);
		expect(buildMemoryGraph).not.toHaveBeenCalled();
	});
	it('lets the owner read the projection', () => {
		expect((load as Function)({ locals: { user: { role: 'owner' } } })).toEqual({ graph: { nodes: [], edges: [] } });
		expect(buildMemoryGraph).toHaveBeenCalledOnce();
	});
});
