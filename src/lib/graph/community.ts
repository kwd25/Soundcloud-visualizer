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
 *
 * Note: `louvain.detailed` returns the partition + modularity but does NOT
 * write to node attributes (only `louvain.assign` does that). We use
 * `detailed` for the modularity stat then copy the assignments onto the
 * graph manually.
 */
export function assignCommunities(graph: Graph): CommunityResult {
	if (graph.order === 0) {
		return { count: 0, modularity: 0 };
	}
	const result = louvain.detailed(graph, {
		nodeCommunityAttribute: COMMUNITY_ATTR,
		getEdgeWeight: "weight",
		resolution: 1,
	});

	for (const [node, community] of Object.entries(result.communities)) {
		graph.setNodeAttribute(node, COMMUNITY_ATTR, community);
	}

	return {
		count: result.count,
		modularity: result.modularity,
	};
}
