import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { edges, tracks } from "@/lib/db/schema";

const CO_LISTENER = "co_listener" as const;
const DEFAULT_MIN_WEIGHT = 3;
const BATCH = 500;
const KEY_SEP = "||";

interface CoListenerEdge {
	src: string;
	dst: string;
	weight: number;
}

/**
 * Build a track ↔ track projection from the bipartite (user → track) graph:
 * for every pair of the owner's tracks, count how many distinct users like
 * both. Keep pairs whose weight clears `minWeight`.
 *
 * Returns the kept pairs. Pure compute — does NOT touch the DB.
 */
export async function computeCoListenerEdges(
	ownerUrn: string,
	opts?: { minWeight?: number },
): Promise<CoListenerEdge[]> {
	const minWeight = opts?.minWeight ?? DEFAULT_MIN_WEIGHT;

	// Owner-liked tracks: src=owner, edge_type=liked. These are the only
	// valid endpoints in the projection.
	const seedRows = await db
		.select({ urn: edges.dstUrn })
		.from(edges)
		.where(
			sql`${edges.ownerUrn} = ${ownerUrn} AND ${edges.srcUrn} = ${ownerUrn} AND ${edges.edgeType} = 'liked'`,
		);
	const trackSet = new Set(seedRows.map((r) => r.urn));

	// All 'liked' edges (excluding owner's own outgoing) — these tell us which
	// other users like which of the owner's tracks.
	const rows = await db
		.select({ src: edges.srcUrn, dst: edges.dstUrn })
		.from(edges)
		.where(
			sql`${edges.ownerUrn} = ${ownerUrn} AND ${edges.edgeType} = 'liked' AND ${edges.srcUrn} <> ${ownerUrn}`,
		);

	const userTracks = new Map<string, Set<string>>();
	for (const { src, dst } of rows) {
		if (!trackSet.has(dst)) continue;
		const set = userTracks.get(src);
		if (set) set.add(dst);
		else userTracks.set(src, new Set([dst]));
	}

	const counts = new Map<string, number>();
	for (const set of userTracks.values()) {
		if (set.size < 2) continue;
		const sorted = Array.from(set).sort();
		for (let i = 0; i < sorted.length; i++) {
			const a = sorted[i];
			if (!a) continue;
			for (let j = i + 1; j < sorted.length; j++) {
				const b = sorted[j];
				if (!b) continue;
				const key = `${a}${KEY_SEP}${b}`;
				counts.set(key, (counts.get(key) ?? 0) + 1);
			}
		}
	}

	const result: CoListenerEdge[] = [];
	for (const [key, weight] of counts) {
		if (weight < minWeight) continue;
		const sepIdx = key.indexOf(KEY_SEP);
		if (sepIdx < 0) continue;
		result.push({
			src: key.slice(0, sepIdx),
			dst: key.slice(sepIdx + KEY_SEP.length),
			weight,
		});
	}
	return result;
}

/**
 * Wipe + replace this owner's co_listener edges with the given set.
 */
export async function persistCoListenerEdges(
	ownerUrn: string,
	rows: CoListenerEdge[],
): Promise<number> {
	await db
		.delete(edges)
		.where(
			sql`${edges.ownerUrn} = ${ownerUrn} AND ${edges.edgeType} = ${CO_LISTENER}`,
		);

	if (rows.length === 0) return 0;

	// Stub-upsert any missing track rows so downstream joins on /api/graph
	// don't drop nodes.
	const allUrns = Array.from(new Set(rows.flatMap((e) => [e.src, e.dst])));
	const existing = await db
		.select({ urn: tracks.urn })
		.from(tracks)
		.where(inArray(tracks.urn, allUrns));
	const have = new Set(existing.map((r) => r.urn));
	const missing = allUrns.filter((u) => !have.has(u));
	if (missing.length > 0) {
		for (let i = 0; i < missing.length; i += BATCH) {
			const chunk = missing.slice(i, i + BATCH);
			await db
				.insert(tracks)
				.values(chunk.map((urn) => ({ urn })))
				.onConflictDoNothing();
		}
	}

	let written = 0;
	for (let i = 0; i < rows.length; i += BATCH) {
		const chunk = rows.slice(i, i + BATCH);
		await db.insert(edges).values(
			chunk.map((e) => ({
				ownerUrn,
				srcUrn: e.src,
				dstUrn: e.dst,
				edgeType: CO_LISTENER,
				weight: e.weight,
			})),
		);
		written += chunk.length;
	}
	return written;
}

export type { CoListenerEdge };
export { CO_LISTENER };
