import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { communityLabels } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
	const session = await auth();
	if (!session?.user?.urn) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const view =
		req.nextUrl.searchParams.get("view") === "bipartite"
			? "bipartite"
			: "tracks";

	const rows = await db
		.select()
		.from(communityLabels)
		.where(
			and(
				eq(communityLabels.ownerUrn, session.user.urn),
				eq(communityLabels.view, view),
			),
		);

	const labels = Object.fromEntries(
		rows.map((r) => [
			r.communityId,
			{
				name: r.name,
				description: r.description,
				themes: r.themes,
				generated_at: r.generatedAt,
			},
		]),
	);

	return Response.json({ view, labels });
}
