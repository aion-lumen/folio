import { describe, expect, it } from 'vitest';
import { escapeGraphTooltip, graphSelection } from './graph-presentation.js';

describe('graph tooltips', () => {
	it.each([
		['<b data-graph-probe="yes">Nur Text</b>', '&lt;b data-graph-probe=&quot;yes&quot;&gt;Nur Text&lt;/b&gt;'],
		["<img src=x onerror='alert(1)'>&", '&lt;img src=x onerror=&#39;alert(1)&#39;&gt;&amp;'],
		['&lt;b&gt; — Zürich', '&amp;lt;b&amp;gt; — Zürich'],
		['belegt durch — Quelle', 'belegt durch — Quelle']
	])('renders %s as literal text', (input, expected) => {
		expect(escapeGraphTooltip(input)).toBe(expected);
	});
});

describe('filtered graph selection', () => {
	const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'isolated' }];
	const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }];

	it('drops details when a selected node is filtered out', () => {
		expect(graphSelection('a', [nodes[1]], [], edges)).toEqual({
			node: null, edges: [], totalConnections: 0, hiddenConnections: 0
		});
	});
	it('distinguishes hidden neighbours or disabled edge types from isolation', () => {
		for (const visibleNodes of [nodes, [nodes[0]]]) {
			expect(graphSelection('a', visibleNodes, [], edges)).toMatchObject({
				node: nodes[0], edges: [], totalConnections: 2, hiddenConnections: 2
			});
		}
	});
	it('counts visible and hidden connections in both directions', () => {
		expect(graphSelection('a', nodes, [edges[0]], edges)).toMatchObject({
			edges: [edges[0]], totalConnections: 2, hiddenConnections: 1
		});
	});
	it('still identifies genuinely isolated nodes', () => {
		expect(graphSelection('isolated', nodes, edges, edges)).toMatchObject({
			node: nodes[2], totalConnections: 0, hiddenConnections: 0
		});
	});
	it('has no details without a selection', () => {
		expect(graphSelection(null, nodes, edges, edges).node).toBeNull();
	});
});
