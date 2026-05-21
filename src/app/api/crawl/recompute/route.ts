import { auth } from "@/lib/auth";
import { inngest } from "@/lib/inngest";

export const dynamic = "force-dynamic";

/**
 * Trigger the layouts-only Inngest function. Reuses the existing `liked`
 * edges in Neon (no SoundCloud crawl) and just recomputes the projection +
 * both layouts. ~30-60s end-to-end.
 */
export async function POST() {
	const session = await auth();
	if (!session?.user?.urn) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const result = await inngest.send({
		name: "layouts/requested",
		data: { ownerUrn: session.user.urn },
	});

	return Response.json({
		ok: true,
		eventIds: result.ids,
		ownerUrn: session.user.urn,
	});
}
