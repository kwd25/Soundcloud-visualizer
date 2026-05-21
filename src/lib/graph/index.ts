import { buildGraphForOwner } from "./build";
import { assignCommunities } from "./community";
import { assignLayout } from "./layout";
import { clearOwnerLayout, graphToLayoutRows, insertLayout } from "./persist";

export interface ComputeLayoutResult {
	nodes: number;
	edges: number;
	prunedNodes: number;
	communities: number;
	modularity: number;
	rowsWritten: number;
}

/**
 * Load this owner's graph from Neon, prune one-off nodes, run Louvain +
 * ForceAtlas2, and persist (x, y, community_id) per node into the `layout`
 * table.
 *
 * Idempotent: clears the owner's previous layout rows first.
 *
 * Must complete in one serverless invocation (≤60s on Vercel Hobby) since
 * it's wrapped in a single step.run(). Pruning + Barnes-Hut keep it under
 * that budget even on raw 75k-node graphs.
 */
export async function computeLayoutAndCommunities(
	ownerUrn: string,
	opts?: { iterations?: number; minDegree?: number },
): Promise<ComputeLayoutResult> {
	const graph = await buildGraphForOwner(ownerUrn, {
		minDegree: opts?.minDegree ?? 2,
	});
	const prunedNodes = (graph.getAttribute("prunedNodes") as number) ?? 0;

	if (graph.order === 0) {
		return {
			nodes: 0,
			edges: 0,
			prunedNodes,
			communities: 0,
			modularity: 0,
			rowsWritten: 0,
		};
	}

	const { count, modularity } = assignCommunities(graph);
	assignLayout(graph, opts?.iterations ?? 300);

	const rows = graphToLayoutRows(ownerUrn, graph);
	await clearOwnerLayout(ownerUrn);
	const rowsWritten = await insertLayout(rows);

	return {
		nodes: graph.order,
		edges: graph.size,
		prunedNodes,
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
