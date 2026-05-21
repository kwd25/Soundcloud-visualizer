import { auth } from "@/lib/auth";
import { me, SoundCloudClient } from "@/lib/soundcloud";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
	const session = await auth();
	if (!session?.user?.urn) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const started = Date.now();
	const client = new SoundCloudClient(session.user.urn);

	try {
		const profile = await me.profile(client);

		const likes: Array<{ urn: string; title: string; uploader: string }> = [];
		for await (const t of me.likes(client, { max: 50 })) {
			likes.push({
				urn: t.urn,
				title: t.title,
				uploader: t.user.username,
			});
		}

		return Response.json({
			ok: true,
			elapsed_ms: Date.now() - started,
			profile: {
				urn: profile.urn,
				username: profile.username,
				followers_count: profile.followers_count,
			},
			likes_sampled: likes.length,
			likes,
		});
	} catch (error) {
		return Response.json(
			{
				ok: false,
				elapsed_ms: Date.now() - started,
				error:
					error instanceof Error
						? { name: error.name, message: error.message }
						: { message: String(error) },
			},
			{ status: 500 },
		);
	}
}
