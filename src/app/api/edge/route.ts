import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { edges, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const MAX_LISTENERS = 30;

/**
 * GET /api/edge?src=URN&dst=URN&view=tracks|bipartite
 *
 * - tracks view: src + dst are both tracks. Returns the top listeners (by
 *   followers_count) who like BOTH tracks in the owner's graph.
 * - bipartite view: src is a user (or owner), dst is a track. Returns the
 *   single edge's weight; no list of additional users.
 */
export async function GET(req: NextRequest) {
	const session = await auth();
	if (!session?.user?.urn) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const ownerUrn = session.user.urn;
	const src = req.nextUrl.searchParams.get("src");
	const dst = req.nextUrl.searchParams.get("dst");
	if (!src || !dst) {
		return Response.json({ error: "src and dst required" }, { status: 400 });
	}
	const view =
		req.nextUrl.searchParams.get("view") === "bipartite"
			? "bipartite"
			: "tracks";

	if (view === "tracks") {
		const [edge] = await db
			.select({ weight: edges.weight })
			.from(edges)
			.where(
				and(
					eq(edges.ownerUrn, ownerUrn),
					eq(edges.edgeType, "co_listener"),
					sql`(${edges.srcUrn} = ${src} AND ${edges.dstUrn} = ${dst}) OR (${edges.srcUrn} = ${dst} AND ${edges.dstUrn} = ${src})`,
				),
			);

		// Find users who liked BOTH src and dst.
		const rows = await db.execute<{
			urn: string;
			username: string | null;
			avatar_url: string | null;
			permalink_url: string | null;
			followers_count: number | null;
		}>(sql`
			SELECT u.urn, u.username, u.avatar_url, u.permalink_url, u.followers_count
			FROM edges e1
			JOIN edges e2
			  ON e2.owner_urn = e1.owner_urn
			 AND e2.src_urn = e1.src_urn
			 AND e2.edge_type = 'liked'
			JOIN users u ON u.urn = e1.src_urn
			WHERE e1.owner_urn = ${ownerUrn}
			  AND e1.edge_type = 'liked'
			  AND e1.src_urn <> ${ownerUrn}
			  AND e1.dst_urn = ${src}
			  AND e2.dst_urn = ${dst}
			ORDER BY u.followers_count DESC NULLS LAST
			LIMIT ${MAX_LISTENERS}
		`);

		return Response.json({
			weight: edge?.weight ?? 0,
			common_listeners: rows.rows,
		});
	}

	// Bipartite view — just the single edge weight (1 by default).
	const [edge] = await db
		.select({ weight: edges.weight })
		.from(edges)
		.where(
			and(
				eq(edges.ownerUrn, ownerUrn),
				eq(edges.edgeType, "liked"),
				eq(edges.srcUrn, src),
				eq(edges.dstUrn, dst),
			),
		);

	// For symmetry, also fetch the user (if src is a user) and the track.
	const [maybeUser] = await db.select().from(users).where(eq(users.urn, src));

	return Response.json({
		weight: edge?.weight ?? 0,
		common_listeners: [],
		user: maybeUser ?? null,
	});
}
