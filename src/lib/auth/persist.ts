import { db } from "@/lib/db";
import { authUsers } from "@/lib/db/schema";
import type { SoundCloudProfile } from "./providers/soundcloud";

interface OAuthTokens {
	access_token: string;
	refresh_token: string;
	expires_at: number;
}

export async function persistInitialTokens(
	profile: SoundCloudProfile,
	tokens: OAuthTokens,
) {
	const expiresAt = new Date(tokens.expires_at * 1000);

	await db
		.insert(authUsers)
		.values({
			soundcloudUrn: profile.urn,
			username: profile.username,
			avatarUrl: profile.avatar_url,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			tokenExpiresAt: expiresAt,
		})
		.onConflictDoUpdate({
			target: authUsers.soundcloudUrn,
			set: {
				username: profile.username,
				avatarUrl: profile.avatar_url,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				tokenExpiresAt: expiresAt,
			},
		});
}
