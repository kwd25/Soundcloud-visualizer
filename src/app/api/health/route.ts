import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
	try {
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(sql`auth_users`);

		return Response.json({
			status: "ok",
			timestamp: new Date().toISOString(),
			db: { connected: true, authUsers: count },
		});
	} catch (error) {
		return Response.json(
			{
				status: "degraded",
				timestamp: new Date().toISOString(),
				db: {
					connected: false,
					error: error instanceof Error ? error.message : "unknown",
				},
			},
			{ status: 503 },
		);
	}
}
