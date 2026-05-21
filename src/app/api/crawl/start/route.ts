import { auth } from "@/lib/auth";
import { inngest } from "@/lib/inngest";

export const dynamic = "force-dynamic";

export async function POST() {
	const session = await auth();
	if (!session?.user?.urn) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const ownerUrn = session.user.urn;
	const result = await inngest.send({
		name: "crawl/requested",
		data: { ownerUrn },
	});

	return Response.json({
		ok: true,
		eventIds: result.ids,
		ownerUrn,
	});
}
