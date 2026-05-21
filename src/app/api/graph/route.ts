import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { edges, layout, tracks, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

interface NodePayload {
	urn: string;
	kind: "track" | "user";
	x: number;
	y: number;
	community: number | null;
	label?: string | null;
	avatar_url?: string | null;
	permalink_url?: string | null;
	followers_count?: number | null;
	likes_count?: number | null;
	uploader_urn?: string | null;
}

interface EdgePayload {
	src: string;
	dst: string;
	weight: number;
}

export async function GET() {
	const session = await auth();
	if (!session?.user?.urn) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const ownerUrn = session.user.urn;

	const layoutRows = await db
		.select()
		.from(layout)
		.where(eq(layout.ownerUrn, ownerUrn));

	if (layoutRows.length === 0) {
		return Response.json({ nodes: [], edges: [], ownerUrn });
	}

	const nodeUrns = layoutRows.map((r) => r.nodeUrn);

	const [trackRows, userRows, edgeRows] = await Promise.all([
		db.select().from(tracks).where(inArray(tracks.urn, nodeUrns)),
		db.select().from(users).where(inArray(users.urn, nodeUrns)),
		db.select().from(edges).where(eq(edges.ownerUrn, ownerUrn)),
	]);

	const trackByUrn = new Map(trackRows.map((t) => [t.urn, t]));
	const userByUrn = new Map(userRows.map((u) => [u.urn, u]));

	const nodes: NodePayload[] = layoutRows.map((l) => {
		const track = trackByUrn.get(l.nodeUrn);
		if (track) {
			return {
				urn: l.nodeUrn,
				kind: "track",
				x: l.x,
				y: l.y,
				community: l.communityId,
				label: track.title,
				permalink_url: track.permalinkUrl,
				likes_count: track.likesCount,
				uploader_urn: track.uploaderUrn,
			};
		}
		const u = userByUrn.get(l.nodeUrn);
		return {
			urn: l.nodeUrn,
			kind: "user",
			x: l.x,
			y: l.y,
			community: l.communityId,
			label: u?.username ?? null,
			avatar_url: u?.avatarUrl ?? null,
			permalink_url: u?.permalinkUrl ?? null,
			followers_count: u?.followersCount ?? null,
		};
	});

	const edgePayload: EdgePayload[] = edgeRows.map((e) => ({
		src: e.srcUrn,
		dst: e.dstUrn,
		weight: e.weight,
	}));

	return Response.json({
		ownerUrn,
		nodes,
		edges: edgePayload,
	});
}
