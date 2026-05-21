import { and, eq } from "drizzle-orm";
import { env } from "@/env";
import { db } from "@/lib/db";
import { authUsers } from "@/lib/db/schema";
import { RefreshTokenError } from "./types";

/**
 * Refresh access tokens this many ms before they actually expire, so we never
 * hand back a token that's about to die mid-request.
 */
const REFRESH_BEFORE_EXPIRY_MS = 60_000;

interface SoundCloudTokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type?: string;
}

/**
 * Returns a valid access token for `soundcloudUrn`, refreshing if needed.
 *
 * SoundCloud rotates the refresh token on every refresh and invalidates the
 * previous one immediately. If two concurrent callers race to refresh, only
 * one wins at SoundCloud; the loser's refresh request fails. We handle that
 * by re-reading the row after a failed refresh — if another process already
 * rotated, we use their tokens. We also use a conditional UPDATE (WHERE
 * refresh_token = $old) so that we never overwrite a fresher row.
 */
export async function getValidAccessToken(
	soundcloudUrn: string,
): Promise<string> {
	const [row] = await db
		.select()
		.from(authUsers)
		.where(eq(authUsers.soundcloudUrn, soundcloudUrn));

	if (!row) {
		throw new Error(`auth_users row not found for ${soundcloudUrn}`);
	}

	if (row.tokenExpiresAt.getTime() > Date.now() + REFRESH_BEFORE_EXPIRY_MS) {
		return row.accessToken;
	}

	return await refreshAndPersist(soundcloudUrn, row.refreshToken);
}

async function refreshAndPersist(
	soundcloudUrn: string,
	oldRefreshToken: string,
): Promise<string> {
	const body = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: oldRefreshToken,
		client_id: env.SOUNDCLOUD_CLIENT_ID,
		client_secret: env.SOUNDCLOUD_CLIENT_SECRET,
	});

	const res = await fetch("https://secure.soundcloud.com/oauth/token", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json; charset=utf-8",
		},
		body,
	});

	if (!res.ok) {
		// Another process may have already rotated the token. Re-read and use
		// theirs if it looks fresh.
		const [fresh] = await db
			.select()
			.from(authUsers)
			.where(eq(authUsers.soundcloudUrn, soundcloudUrn));
		if (
			fresh &&
			fresh.refreshToken !== oldRefreshToken &&
			fresh.tokenExpiresAt.getTime() > Date.now() + REFRESH_BEFORE_EXPIRY_MS
		) {
			return fresh.accessToken;
		}
		throw new RefreshTokenError(res.status, await res.text());
	}

	const tokens = (await res.json()) as SoundCloudTokenResponse;
	const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

	// Conditional write: only update if the refresh token hasn't changed since
	// we read it. If it has, another process won the race — fall through to
	// the re-read branch below.
	const updated = await db
		.update(authUsers)
		.set({
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			tokenExpiresAt: newExpiresAt,
		})
		.where(
			and(
				eq(authUsers.soundcloudUrn, soundcloudUrn),
				eq(authUsers.refreshToken, oldRefreshToken),
			),
		)
		.returning({ urn: authUsers.soundcloudUrn });

	if (updated.length === 0) {
		const [fresh] = await db
			.select()
			.from(authUsers)
			.where(eq(authUsers.soundcloudUrn, soundcloudUrn));
		if (!fresh) {
			throw new Error(`auth_users row disappeared for ${soundcloudUrn}`);
		}
		return fresh.accessToken;
	}

	return tokens.access_token;
}
