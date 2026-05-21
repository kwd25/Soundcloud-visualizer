import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function Home() {
	const session = await auth();
	if (session?.user?.urn) {
		redirect("/dashboard");
	}

	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-24 text-center">
			<div className="max-w-xl space-y-6">
				<h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
					Your SoundCloud, mapped.
				</h1>
				<p className="text-lg text-muted-foreground">
					Log in to see the community graph of the music you love — your likes,
					the people who share them, and the scenes you sit inside.
				</p>
				<div className="flex items-center justify-center gap-3 pt-4">
					<form
						action={async () => {
							"use server";
							await signIn("soundcloud", { redirectTo: "/dashboard" });
						}}
					>
						<button
							type="submit"
							className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
						>
							Log in with SoundCloud
						</button>
					</form>
					<Link
						href="/api/health"
						className="text-sm text-muted-foreground underline-offset-4 hover:underline"
					>
						/api/health
					</Link>
				</div>
				<p className="pt-12 text-xs text-muted-foreground">
					Phase 3 (auth) · see <code>docs/phases.md</code>
				</p>
			</div>
		</main>
	);
}
