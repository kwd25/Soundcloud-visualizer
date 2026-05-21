import { CrawlStatus } from "@/components/crawl-status";
import { auth, signOut } from "@/lib/auth";

export default async function Dashboard() {
	const session = await auth();
	const user = session?.user;

	return (
		<main className="flex min-h-screen flex-col items-center justify-center px-6 py-24">
			<div className="w-full max-w-xl space-y-8 text-center">
				<div className="flex flex-col items-center gap-4">
					{user?.image && (
						// biome-ignore lint/performance/noImgElement: external SoundCloud avatar
						<img
							src={user.image}
							alt={user.name ?? "avatar"}
							className="size-24 rounded-full border-2 border-[var(--jade)]/40 shadow-[0_0_32px_oklch(0.78_0.16_165/30%)]"
						/>
					)}
					<div>
						<h1 className="text-3xl font-semibold tracking-tight">
							Welcome, {user?.name ?? "friend"}
						</h1>
						<p className="mt-1 font-mono text-xs text-muted-foreground break-all">
							{user?.urn}
						</p>
					</div>
				</div>

				<CrawlStatus />

				<form
					action={async () => {
						"use server";
						await signOut({ redirectTo: "/" });
					}}
				>
					<button
						type="submit"
						className="text-xs text-muted-foreground underline-offset-4 hover:underline"
					>
						Log out
					</button>
				</form>
			</div>
		</main>
	);
}
