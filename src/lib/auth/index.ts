import NextAuth from "next-auth";
import { env } from "@/env";
import { persistInitialTokens } from "./persist";
import SoundCloud, { type SoundCloudProfile } from "./providers/soundcloud";

export const { auth, handlers, signIn, signOut } = NextAuth({
	secret: env.AUTH_SECRET,
	session: { strategy: "jwt" },
	providers: [
		SoundCloud({
			clientId: env.SOUNDCLOUD_CLIENT_ID,
			clientSecret: env.SOUNDCLOUD_CLIENT_SECRET,
		}),
	],
	callbacks: {
		async jwt({ token, account, profile }) {
			if (account && profile) {
				const sc = profile as unknown as SoundCloudProfile;
				if (
					typeof account.access_token === "string" &&
					typeof account.refresh_token === "string" &&
					typeof account.expires_at === "number"
				) {
					await persistInitialTokens(sc, {
						access_token: account.access_token,
						refresh_token: account.refresh_token,
						expires_at: account.expires_at,
					});
				}
				token.urn = sc.urn;
			}
			return token;
		},
		async session({ session, token }) {
			const urn = token.urn;
			if (typeof urn === "string") {
				session.user.urn = urn;
			}
			return session;
		},
	},
	pages: {
		signIn: "/",
	},
});
