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
 * - view='bipartite': all `liked` edges (user ↔ track), pruned at the SQL
 *   layer to users whose degree clears `minDegree`. This avoids pulling
 *   100k+ degree-1 rows just to drop them in JS. The owner is always kept.
 * - view='tracks': `co_listener` edges (track ↔ track) with weight≥3.
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

/**
 * Bipartite view with SQL-side pruning. We compute each user's degree in
 * Postgres and only return edges whose source is either the owner or a
 * user clearing minDegree. This collapses a ~200k-edge fetch to ~30-60k.
 */
async function buildBipartiteGraph(
	ownerUrn: string,
	minDegree: number,
): Promise<Graph> {
	const rows = await db.execute<{
		src_urn: string;
		dst_urn: string;
		weight: number;
	}>(sql`
		WITH degrees AS (
			SELECT src_urn, COUNT(*) AS deg
			FROM edges
			WHERE owner_urn = ${ownerUrn}
			  AND edge_type = 'liked'
			  AND src_urn <> ${ownerUrn}
			GROUP BY src_urn
		)
		SELECT e.src_urn, e.dst_urn, e.weight
		FROM edges e
		WHERE e.owner_urn = ${ownerUrn}
		  AND e.edge_type = 'liked'
		  AND (
		    e.src_urn = ${ownerUrn}
		    OR e.src_urn IN (
		      SELECT src_urn FROM degrees WHERE deg >= ${minDegree}
		    )
		  )
	`);

	const graph = new Graph({ type: "undirected", multi: false });
	let kept = 0;
	for (const row of rows.rows) {
		if (!graph.hasNode(row.src_urn)) graph.addNode(row.src_urn);
		if (!graph.hasNode(row.dst_urn)) graph.addNode(row.dst_urn);
		if (!graph.hasEdge(row.src_urn, row.dst_urn)) {
			graph.addEdge(row.src_urn, row.dst_urn, { weight: row.weight });
			kept++;
		}
	}
	graph.setAttribute("loadedEdges", kept);
	return graph;
}

export { sql };
