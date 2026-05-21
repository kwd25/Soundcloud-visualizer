import { buildGraphForOwner } from "./build";
import { assignCommunities } from "./community";
import { assignLayout } from "./layout";
import { clearOwnerLayout, graphToLayoutRows, insertLayout } from "./persist";

export interface ComputeLayoutResult {
	nodes: number;
	edges: number;
	communities: number;
	modularity: number;
	rowsWritten: number;
}

/**
 * Load this owner's graph from Neon, run Louvain + ForceAtlas2, and persist
 * the resulting (x, y, community_id) per node into the `layout` table.
 *
 * Idempotent: clears the owner's previous layout rows first.
 */
export async function computeLayoutAndCommunities(
	ownerUrn: string,
	opts?: { iterations?: number },
): Promise<ComputeLayoutResult> {
	const graph = await buildGraphForOwner(ownerUrn);
	if (graph.order === 0) {
		return {
			nodes: 0,
			edges: 0,
			communities: 0,
			modularity: 0,
			rowsWritten: 0,
		};
	}

	const { count, modularity } = assignCommunities(graph);
	assignLayout(graph, opts?.iterations ?? 500);

	const rows = graphToLayoutRows(ownerUrn, graph);
	await clearOwnerLayout(ownerUrn);
	const rowsWritten = await insertLayout(rows);

	return {
		nodes: graph.order,
		edges: graph.size,
		communities: count,
		modularity,
		rowsWritten,
	};
}

export { buildGraphForOwner } from "./build";
export { assignCommunities } from "./community";
export { assignLayout } from "./layout";
export {
	clearOwnerLayout,
	graphToLayoutRows,
	insertLayout,
} from "./persist";
