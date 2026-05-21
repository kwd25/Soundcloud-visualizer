import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function Home() {
	const session = await auth();
	if (session?.user?.urn) {
		redirect("/dashboard");
	}

	return (
		<main className="flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center">
			<div className="glass-strong max-w-xl space-y-6 px-10 py-14">
				<h1 className="bg-gradient-to-br from-[var(--jade)] via-foreground to-[var(--amethyst)] bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl">
					Your SoundCloud, mapped.
				</h1>
				<p className="text-base text-foreground/70">
					Log in and we'll plot the community graph of the music you love — your
					likes, the people who share them, and the scenes you sit inside.
				</p>
				<form
					action={async () => {
						"use server";
						await signIn("soundcloud", { redirectTo: "/dashboard" });
					}}
				>
					<button
						type="submit"
						className="rounded-md border border-[var(--jade)]/40 bg-[var(--jade)]/15 px-6 py-2.5 text-sm font-medium text-[var(--jade)] shadow-[0_0_24px_oklch(0.78_0.16_165/25%)] transition hover:bg-[var(--jade)]/25"
					>
						Log in with SoundCloud
					</button>
				</form>
				<p className="pt-4 text-[10px] uppercase tracking-widest text-muted-foreground/60">
					Powered by your taste · phase 7
				</p>
			</div>
		</main>
	);
}
