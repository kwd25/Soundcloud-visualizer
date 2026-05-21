import type Graph from "graphology";
import louvain from "graphology-communities-louvain";

const COMMUNITY_ATTR = "community";

export interface CommunityResult {
	count: number;
	modularity: number;
}

/**
 * Run Louvain on the graph and assign a `community` integer attribute to
 * every node. Returns the cluster count and modularity score (higher = more
 * meaningful clustering; >0.3 is usually a sign of real structure).
 */
export function assignCommunities(graph: Graph): CommunityResult {
	if (graph.order === 0) {
		return { count: 0, modularity: 0 };
	}
	const result = louvain.detailed(graph, {
		nodeCommunityAttribute: COMMUNITY_ATTR,
		getEdgeWeight: "weight",
		// resolution > 1 → more, smaller communities. 1 is the default.
		resolution: 1,
	});
	return {
		count: result.count,
		modularity: result.modularity,
	};
}
