import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { edges, tracks, users } from "@/lib/db/schema";
import type { SoundCloudTrack, SoundCloudUser } from "@/lib/soundcloud";

const BATCH_SIZE = 100;

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		out.push(arr.slice(i, i + size));
	}
	return out;
}

/** Upsert SoundCloud users into the `users` table, deduped by URN. */
export async function upsertUsers(rows: SoundCloudUser[]): Promise<number> {
	if (rows.length === 0) return 0;
	const dedup = new Map<string, SoundCloudUser>();
	for (const u of rows) dedup.set(u.urn, u);
	const unique = Array.from(dedup.values());

	let written = 0;
	for (const batch of chunk(unique, BATCH_SIZE)) {
		await db
			.insert(users)
			.values(
				batch.map((u) => ({
					urn: u.urn,
					username: u.username,
					avatarUrl: u.avatar_url,
					permalinkUrl: u.permalink_url,
					followersCount: u.followers_count,
				})),
			)
			.onConflictDoUpdate({
				target: users.urn,
				set: {
					username: sql`excluded.username`,
					avatarUrl: sql`excluded.avatar_url`,
					permalinkUrl: sql`excluded.permalink_url`,
					followersCount: sql`excluded.followers_count`,
					fetchedAt: sql`now()`,
				},
			});
		written += batch.length;
	}
	return written;
}

/**
 * Upsert tracks AND their uploaders (each track has a nested `user`).
 * Uploaders go to `users` first so the FK on tracks.uploader_urn is satisfied.
 */
export async function upsertTracksAndUploaders(
	rows: SoundCloudTrack[],
): Promise<{ tracksWritten: number; usersWritten: number }> {
	if (rows.length === 0) return { tracksWritten: 0, usersWritten: 0 };

	const uploaders = rows.map((t) => t.user);
	const usersWritten = await upsertUsers(uploaders);

	let tracksWritten = 0;
	for (const batch of chunk(rows, BATCH_SIZE)) {
		await db
			.insert(tracks)
			.values(
				batch.map((t) => ({
					urn: t.urn,
					title: t.title,
					permalinkUrl: t.permalink_url,
					artworkUrl: t.artwork_url ?? null,
					uploaderUrn: t.user.urn,
					likesCount: t.likes_count,
					playbackCount: t.playback_count,
				})),
			)
			.onConflictDoUpdate({
				target: tracks.urn,
				set: {
					title: sql`excluded.title`,
					permalinkUrl: sql`excluded.permalink_url`,
					artworkUrl: sql`excluded.artwork_url`,
					uploaderUrn: sql`excluded.uploader_urn`,
					likesCount: sql`excluded.likes_count`,
					playbackCount: sql`excluded.playback_count`,
					fetchedAt: sql`now()`,
				},
			});
		tracksWritten += batch.length;
	}
	return { tracksWritten, usersWritten };
}

export interface EdgeRow {
	srcUrn: string;
	dstUrn: string;
	edgeType: "liked";
	weight?: number;
}

/** Insert `liked` edges for an owner. Idempotent via ON CONFLICT DO NOTHING. */
export async function insertEdges(
	ownerUrn: string,
	rows: EdgeRow[],
): Promise<number> {
	if (rows.length === 0) return 0;
	let written = 0;
	for (const batch of chunk(rows, BATCH_SIZE)) {
		await db
			.insert(edges)
			.values(
				batch.map((e) => ({
					ownerUrn,
					srcUrn: e.srcUrn,
					dstUrn: e.dstUrn,
					edgeType: e.edgeType,
					weight: e.weight ?? 1,
				})),
			)
			.onConflictDoNothing();
		written += batch.length;
	}
	return written;
}

/** Wipe all edges for an owner before a fresh crawl. */
export async function clearOwnerEdges(ownerUrn: string): Promise<void> {
	await db.delete(edges).where(eq(edges.ownerUrn, ownerUrn));
}
