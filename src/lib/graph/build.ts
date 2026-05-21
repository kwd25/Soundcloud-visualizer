import { eq } from "drizzle-orm";
import Graph from "graphology";
import { db } from "@/lib/db";
import { edges } from "@/lib/db/schema";

export interface BuildGraphOptions {
	/**
	 * Drop nodes whose degree (in the combined edge set) is less than this.
	 * Always keeps the owner node and all seed tracks regardless.
	 *
	 * Defaults to 2 — drops one-off favoriters (which are ~85% of the raw
	 * graph and dominate runtime without contributing to community structure).
	 * Set to 1 to keep everything.
	 */
	minDegree?: number;
	/** The owner's URN so we never prune the central node. */
	ownerUrn: string;
}

/**
 * Build an undirected graphology Graph from the `edges` table for one owner.
 *
 * The bipartite (users → tracks) edges are collapsed into an undirected graph
 * for community detection and layout. Duplicate edges are ignored. Low-degree
 * nodes are pruned by default — see `minDegree`.
 */
export async function buildGraphForOwner(
	ownerUrn: string,
	opts?: { minDegree?: number },
): Promise<Graph> {
	const minDegree = opts?.minDegree ?? 2;
	const rows = await db
		.select()
		.from(edges)
		.where(eq(edges.ownerUrn, ownerUrn));

	// First pass: build the full graph
	const graph = new Graph({ type: "undirected", multi: false });
	for (const row of rows) {
		if (!graph.hasNode(row.srcUrn)) graph.addNode(row.srcUrn);
		if (!graph.hasNode(row.dstUrn)) graph.addNode(row.dstUrn);
		if (!graph.hasEdge(row.srcUrn, row.dstUrn)) {
			graph.addEdge(row.srcUrn, row.dstUrn, { weight: row.weight });
		}
	}

	if (minDegree <= 1) return graph;

	// Iteratively prune nodes below threshold (one pass is usually enough;
	// repeat until stable to remove cascading low-degree nodes).
	let removed = 0;
	while (true) {
		const toRemove: string[] = [];
		graph.forEachNode((node) => {
			if (node === ownerUrn) return;
			if (graph.degree(node) < minDegree) toRemove.push(node);
		});
		if (toRemove.length === 0) break;
		for (const node of toRemove) graph.dropNode(node);
		removed += toRemove.length;
	}

	graph.setAttribute("prunedNodes", removed);
	return graph;
}
