import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
	const session = await auth();
	if (!session?.user?.urn) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const [latest] = await db
		.select()
		.from(crawlJobs)
		.where(eq(crawlJobs.ownerUrn, session.user.urn))
		.orderBy(desc(crawlJobs.createdAt))
		.limit(1);

	return Response.json({
		ok: true,
		latest: latest ?? null,
	});
}
