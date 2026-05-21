import { buildGraphForOwner, type ViewKind } from "./build";
import { assignCommunities } from "./community";
import { assignLayout } from "./layout";
import { clearOwnerLayout, graphToLayoutRows, insertLayout } from "./persist";
import { computeCoListenerEdges, persistCoListenerEdges } from "./projection";

export interface ViewResult {
	nodes: number;
	edges: number;
	communities: number;
	modularity: number;
}

export interface ComputeLayoutResult {
	bipartite: ViewResult & { prunedNodes: number };
	tracks: ViewResult & { kept: number };
}

/**
 * After a crawl:
 * 1. Derive the track ↔ track co-listener projection (weight ≥ 3 default)
 *    and persist as edges with edge_type='co_listener'.
 * 2. Build the bipartite graph, run Louvain + FA2, persist layout view='bipartite'.
 * 3. Build the tracks-only graph from co_listener edges, run Louvain + FA2,
 *    persist layout view='tracks'.
 *
 * Both views must complete in one Inngest step.run() (≤60s on Hobby).
 * Bipartite is pruned to degree≥2 to fit the budget; tracks view is small
 * by construction (≤ owner's seed count, usually 1k–2k).
 */
export async function computeAllLayouts(
	ownerUrn: string,
	opts?: {
		bipartiteMinDegree?: number;
		tracksMinWeight?: number;
		iterations?: { bipartite?: number; tracks?: number };
	},
): Promise<ComputeLayoutResult> {
	// ── tracks projection (compute + persist co_listener edges) ──
	const coEdges = await computeCoListenerEdges(ownerUrn, {
		minWeight: opts?.tracksMinWeight ?? 3,
	});
	await persistCoListenerEdges(ownerUrn, coEdges);

	// ── bipartite view layout ──
	const biGraph = await buildGraphForOwner({
		view: "bipartite",
		ownerUrn,
		minDegree: opts?.bipartiteMinDegree ?? 2,
	});
	const biPruned = (biGraph.getAttribute("prunedNodes") as number) ?? 0;

	let bipartiteResult: ViewResult & { prunedNodes: number } = {
		nodes: 0,
		edges: 0,
		prunedNodes: biPruned,
		communities: 0,
		modularity: 0,
	};

	if (biGraph.order > 0) {
		const { count, modularity } = assignCommunities(biGraph);
		assignLayout(biGraph, {
			iterations: opts?.iterations?.bipartite ?? 150,
			scalingRatio: 15,
			adjustSizes: true,
		});
		const rows = graphToLayoutRows(ownerUrn, "bipartite", biGraph);
		await clearOwnerLayout(ownerUrn, "bipartite");
		await insertLayout(rows);
		bipartiteResult = {
			nodes: biGraph.order,
			edges: biGraph.size,
			prunedNodes: biPruned,
			communities: count,
			modularity,
		};
	}

	// ── tracks view layout ──
	const trackGraph = await buildGraphForOwner({
		view: "tracks",
		ownerUrn,
	});

	let tracksResult: ViewResult & { kept: number } = {
		nodes: 0,
		edges: 0,
		kept: coEdges.length,
		communities: 0,
		modularity: 0,
	};

	if (trackGraph.order > 0) {
		const { count, modularity } = assignCommunities(trackGraph);
		assignLayout(trackGraph, {
			iterations: opts?.iterations?.tracks ?? 600,
			scalingRatio: 50,
			gravity: 0.5,
			adjustSizes: true,
			linLogMode: true,
		});
		const rows = graphToLayoutRows(ownerUrn, "tracks", trackGraph);
		await clearOwnerLayout(ownerUrn, "tracks");
		await insertLayout(rows);
		tracksResult = {
			nodes: trackGraph.order,
			edges: trackGraph.size,
			kept: coEdges.length,
			communities: count,
			modularity,
		};
	}

	return { bipartite: bipartiteResult, tracks: tracksResult };
}

export type { ViewKind } from "./build";
export { buildGraphForOwner } from "./build";
export { assignCommunities } from "./community";
export { assignLayout } from "./layout";
export {
	clearOwnerLayout,
	graphToLayoutRows,
	insertLayout,
} from "./persist";
export {
	computeCoListenerEdges,
	persistCoListenerEdges,
} from "./projection";
