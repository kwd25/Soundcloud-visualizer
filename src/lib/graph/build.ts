import { eq } from "drizzle-orm";
import Graph from "graphology";
import { db } from "@/lib/db";
import { edges } from "@/lib/db/schema";

/**
 * Build an undirected graphology Graph from the `edges` table for one owner.
 *
 * The bipartite structure (users → tracks) is collapsed into an undirected
 * graph for community detection and layout. Duplicate edges are ignored.
 */
export async function buildGraphForOwner(ownerUrn: string): Promise<Graph> {
	const rows = await db
		.select()
		.from(edges)
		.where(eq(edges.ownerUrn, ownerUrn));

	const graph = new Graph({ type: "undirected", multi: false });

	for (const row of rows) {
		if (!graph.hasNode(row.srcUrn)) graph.addNode(row.srcUrn);
		if (!graph.hasNode(row.dstUrn)) graph.addNode(row.dstUrn);
		if (!graph.hasEdge(row.srcUrn, row.dstUrn)) {
			graph.addEdge(row.srcUrn, row.dstUrn, { weight: row.weight });
		}
	}

	return graph;
}
