import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server.js';
import { load as memoryEntry } from '../+page.server.js';
import { load as memoryLayout } from '../+layout.server.js';
import { buildMemoryGraph } from '$lib/server/memory/graph.js';

vi.mock('$lib/server/memory/graph.js', () => ({ buildMemoryGraph: vi.fn(() => ({ nodes: [], edges: [] })) }));

describe('Memory graph access', () => {
	beforeEach(() => vi.clearAllMocks());
	it.each(['council_member', 'guest', undefined])('denies %s before reading the graph', (role) => {
		const event = { locals: { user: role ? { role } : undefined } };
		for (const loader of [load, memoryEntry, memoryLayout]) {
			expect(() => (loader as Function)(event)).toThrow(expect.objectContaining({ status: 403 }));
		}
		expect(buildMemoryGraph).not.toHaveBeenCalled();
	});
	it('lets the owner read the projection', () => {
		expect((load as Function)({ locals: { user: { role: 'owner' } } })).toEqual({ graph: { nodes: [], edges: [] } });
		expect(buildMemoryGraph).toHaveBeenCalledOnce();
	});
	it('connects the existing Memory navigation entry to the graph', () => {
		expect(() => (memoryEntry as Function)({ locals: { user: { role: 'owner' } } }))
			.toThrow(expect.objectContaining({ status: 307, location: '/memory/graph' }));
	});
});
