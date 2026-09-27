// The graph library treats tooltip strings as HTML, unlike Svelte text bindings.
export function escapeGraphTooltip(text: string): string {
	return text.replace(/[&<>"']/g, (character) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
	})[character]!);
}

export function graphSelection<Node extends { id: string }, Edge extends { source: string; target: string }>(
	selectedId: string | null,
	visibleNodes: Node[],
	visibleEdges: Edge[],
	allEdges: Edge[]
) {
	const node = visibleNodes.find((item) => item.id === selectedId) ?? null;
	const touchesNode = (edge: Edge) => edge.source === selectedId || edge.target === selectedId;
	const edges = node ? visibleEdges.filter(touchesNode) : [];
	const totalConnections = node ? allEdges.filter(touchesNode).length : 0;
	return { node, edges, totalConnections, hiddenConnections: totalConnections - edges.length };
}
