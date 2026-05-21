import { and, eq, sql } from "drizzle-orm";
import Graph from "graphology";
import { db } from "@/lib/db";
import { edges } from "@/lib/db/schema";

export type ViewKind = "bipartite" | "tracks";

interface BipartiteOptions {
	view: "bipartite";
	ownerUrn: string;
	minDegree?: number;
}

interface TracksOptions {
	view: "tracks";
	ownerUrn: string;
}

/**
 * Build an undirected graphology Graph for one owner, scoped to a view.
 *
 * - view='bipartite': all `liked` edges (user ↔ track), pruned by minDegree.
 *   Keeps owner node always; iteratively drops below-threshold nodes.
 * - view='tracks': only `co_listener` edges (track ↔ track) with weight≥3.
 */
export async function buildGraphForOwner(
	opts: BipartiteOptions | TracksOptions,
): Promise<Graph> {
	if (opts.view === "tracks") {
		return buildTracksGraph(opts.ownerUrn);
	}
	return buildBipartiteGraph(opts.ownerUrn, opts.minDegree ?? 2);
}

async function buildTracksGraph(ownerUrn: string): Promise<Graph> {
	const rows = await db
		.select({ src: edges.srcUrn, dst: edges.dstUrn, weight: edges.weight })
		.from(edges)
		.where(
			and(eq(edges.ownerUrn, ownerUrn), eq(edges.edgeType, "co_listener")),
		);

	const graph = new Graph({ type: "undirected", multi: false });
	for (const row of rows) {
		if (!graph.hasNode(row.src)) graph.addNode(row.src);
		if (!graph.hasNode(row.dst)) graph.addNode(row.dst);
		if (!graph.hasEdge(row.src, row.dst)) {
			graph.addEdge(row.src, row.dst, { weight: row.weight });
		}
	}
	return graph;
}

async function buildBipartiteGraph(
	ownerUrn: string,
	minDegree: number,
): Promise<Graph> {
	const rows = await db
		.select({ src: edges.srcUrn, dst: edges.dstUrn, weight: edges.weight })
		.from(edges)
		.where(and(eq(edges.ownerUrn, ownerUrn), eq(edges.edgeType, "liked")));

	const graph = new Graph({ type: "undirected", multi: false });
	for (const row of rows) {
		if (!graph.hasNode(row.src)) graph.addNode(row.src);
		if (!graph.hasNode(row.dst)) graph.addNode(row.dst);
		if (!graph.hasEdge(row.src, row.dst)) {
			graph.addEdge(row.src, row.dst, { weight: row.weight });
		}
	}

	if (minDegree <= 1) return graph;

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

// Re-export sql for callers that need it (e.g. tests).
export { sql };
