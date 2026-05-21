import { auth, signOut } from "@/lib/auth";

export default async function Dashboard() {
	const session = await auth();
	const user = session?.user;

	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-24">
			<div className="w-full max-w-xl space-y-6 text-center">
				<div className="flex flex-col items-center gap-4">
					{user?.image && (
						// biome-ignore lint/performance/noImgElement: external SoundCloud avatar
						<img
							src={user.image}
							alt={user.name ?? "avatar"}
							className="size-20 rounded-full"
						/>
					)}
					<h1 className="text-3xl font-semibold tracking-tight">
						Welcome, {user?.name ?? "friend"}
					</h1>
					<p className="text-sm text-muted-foreground break-all">{user?.urn}</p>
				</div>

				<div className="rounded-md border bg-muted/30 p-6 text-left text-sm">
					<p className="font-medium">Coming next:</p>
					<ul className="mt-2 list-disc pl-5 text-muted-foreground">
						<li>Phase 4 — SoundCloud API client</li>
						<li>Phase 5 — Inngest crawler over your likes</li>
						<li>Phase 6 — community detection + layout</li>
						<li>Phase 7 — interactive WebGL graph</li>
					</ul>
				</div>

				<form
					action={async () => {
						"use server";
						await signOut({ redirectTo: "/" });
					}}
				>
					<button
						type="submit"
						className="text-sm text-muted-foreground underline-offset-4 hover:underline"
					>
						Log out
					</button>
				</form>
			</div>
		</main>
	);
}
