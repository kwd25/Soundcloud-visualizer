import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { db } from "@/lib/db";
import { communityLabels } from "@/lib/db/schema";

const MODEL_ID = "claude-sonnet-4-5-20250929";
/** Top N tracks per community we include in the prompt context. */
const TRACKS_PER_COMMUNITY = 15;
/** Skip communities smaller than this when labeling. Their labels stay #N. */
const MIN_COMMUNITY_SIZE_TO_LABEL = 3;

const LabelSchema = z.object({
	id: z.number().int(),
	name: z.string().min(1).max(80),
	description: z.string().min(1).max(400),
	themes: z.array(z.string().min(1).max(40)).min(0).max(8),
});

const PassOutputSchema = z.object({
	communities: z.array(LabelSchema),
});

export interface CommunityContext {
	id: number;
	size: number;
	tracks: Array<{ title: string; uploader: string }>;
}

export interface CommunityLabel {
	id: number;
	name: string;
	description: string;
	themes: string[];
}

/**
 * Pull the top-N tracks (by within-community degree) for every community in
 * the owner's tracks-view layout. Used as prompt context for labeling.
 */
export async function fetchCommunityContexts(
	ownerUrn: string,
): Promise<CommunityContext[]> {
	const rows = await db.execute<{
		community_id: number;
		size: number;
		urn: string;
		title: string | null;
		uploader_username: string | null;
		degree: number;
	}>(sql`
		WITH community_sizes AS (
			SELECT community_id, COUNT(*) AS sz
			FROM layout
			WHERE owner_urn = ${ownerUrn} AND view = 'tracks' AND community_id IS NOT NULL
			GROUP BY community_id
		),
		track_degrees AS (
			SELECT l.community_id, l.node_urn, COUNT(e.*) AS deg
			FROM layout l
			LEFT JOIN edges e
			  ON e.owner_urn = l.owner_urn
			 AND e.edge_type = 'co_listener'
			 AND (e.src_urn = l.node_urn OR e.dst_urn = l.node_urn)
			WHERE l.owner_urn = ${ownerUrn} AND l.view = 'tracks' AND l.community_id IS NOT NULL
			GROUP BY l.community_id, l.node_urn
		),
		ranked AS (
			SELECT
			  td.community_id,
			  td.node_urn,
			  td.deg,
			  ROW_NUMBER() OVER (PARTITION BY td.community_id ORDER BY td.deg DESC) AS rk
			FROM track_degrees td
		)
		SELECT
		  r.community_id,
		  cs.sz AS size,
		  r.node_urn AS urn,
		  t.title,
		  u.username AS uploader_username,
		  r.deg AS degree
		FROM ranked r
		JOIN community_sizes cs ON cs.community_id = r.community_id
		LEFT JOIN tracks t ON t.urn = r.node_urn
		LEFT JOIN users u ON u.urn = t.uploader_urn
		WHERE r.rk <= ${TRACKS_PER_COMMUNITY}
		ORDER BY r.community_id, r.rk
	`);

	const byCommunity = new Map<number, CommunityContext>();
	for (const r of rows.rows) {
		const cid = r.community_id;
		let ctx = byCommunity.get(cid);
		if (!ctx) {
			ctx = { id: cid, size: Number(r.size), tracks: [] };
			byCommunity.set(cid, ctx);
		}
		if (r.title) {
			ctx.tracks.push({
				title: r.title,
				uploader: r.uploader_username ?? "unknown",
			});
		}
	}
	return Array.from(byCommunity.values())
		.filter((c) => c.size >= MIN_COMMUNITY_SIZE_TO_LABEL)
		.sort((a, b) => b.size - a.size);
}

function formatCommunitiesBlock(ctxs: CommunityContext[]): string {
	return ctxs
		.map((c) => {
			const tracksList = c.tracks
				.map((t) => `  - "${t.title}" by ${t.uploader}`)
				.join("\n");
			return `Community #${c.id} (${c.size} tracks)\n${tracksList || "  (no track metadata)"}`;
		})
		.join("\n\n");
}

const PASS_1_SYSTEM = `You are a music journalist with deep knowledge of online subgenres, electronic music scenes, and SoundCloud subcultures (slowed+reverb, nightcore, hyperpop, plugg, dnb, jersey club, phonk, drift phonk, ambient, vaporwave, breakcore, drumkits/sample packs, regional rap microscenes, etc.).

You'll be given clusters of tracks. Each cluster shares many co-listeners on SoundCloud, so it likely represents a real musical scene, subgenre, or aesthetic.

For each cluster, produce a label:
- name: 2-5 words. Evocative, specific, in the actual vocabulary listeners would use. Avoid generic terms like "Pop" or "Music". When a clear genre marker shows up in track titles (e.g. "slowed + reverb", "nightcore"), use that.
- description: 1-2 sentences. What musical/cultural features unify these tracks?
- themes: 3-6 short tags (lowercase, single words or hyphenated)`;

const PASS_2_SYSTEM = `You are reviewing a draft of community labels for clarity and distinctness.

Two refinement goals:
1. DISTINCTNESS — scan all draft labels side-by-side. If any two communities have similar or overlapping names, rename one or both to capture what musically distinguishes them (production style, era, BPM, vocal style, regional origin, mood). After this pass, no two names should be confusable.
2. SPECIFICITY — rewrite each description to 2-3 sentences that name concrete features: production techniques, BPM ranges, era markers, vocal characteristics, cultural origin, listening context. Cite specific track or artist patterns you can see.

Preserve labels that are already clear, distinctive, and specific. Only revise where there's a real improvement.`;

function buildPass1Prompt(ctxs: CommunityContext[]): string {
	return `Below are ${ctxs.length} communities of co-listened SoundCloud tracks. Label each one.\n\n${formatCommunitiesBlock(ctxs)}`;
}

function buildPass2Prompt(
	ctxs: CommunityContext[],
	drafts: CommunityLabel[],
): string {
	const draftBlock = drafts
		.map((d) => {
			const ctx = ctxs.find((c) => c.id === d.id);
			const tracksList = ctx?.tracks
				.map((t) => `  - "${t.title}" by ${t.uploader}`)
				.join("\n");
			return `Community #${d.id} — DRAFT NAME: "${d.name}"
DRAFT DESCRIPTION: ${d.description}
DRAFT THEMES: [${d.themes.join(", ")}]
Representative tracks:
${tracksList || "  (no tracks)"}`;
		})
		.join("\n\n");

	return `Review and refine these draft labels. Return the same set of communities (same ids) with refined name/description/themes.\n\n${draftBlock}`;
}

async function callLLM(
	systemPrompt: string,
	userPrompt: string,
): Promise<CommunityLabel[]> {
	process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
	const { object } = await generateObject({
		model: anthropic(MODEL_ID),
		schema: PassOutputSchema,
		system: systemPrompt,
		prompt: userPrompt,
		temperature: 0.7,
		maxRetries: 2,
	});
	return object.communities;
}

export async function labelDraft(
	ctxs: CommunityContext[],
): Promise<CommunityLabel[]> {
	if (ctxs.length === 0) return [];
	return await callLLM(PASS_1_SYSTEM, buildPass1Prompt(ctxs));
}

export async function labelRefine(
	ctxs: CommunityContext[],
	drafts: CommunityLabel[],
): Promise<CommunityLabel[]> {
	if (drafts.length === 0) return [];
	return await callLLM(PASS_2_SYSTEM, buildPass2Prompt(ctxs, drafts));
}

/** Wipe + replace community_labels for an owner+view. */
export async function persistLabels(
	ownerUrn: string,
	view: "tracks" | "bipartite",
	labels: CommunityLabel[],
): Promise<number> {
	await db
		.delete(communityLabels)
		.where(
			and(
				eq(communityLabels.ownerUrn, ownerUrn),
				eq(communityLabels.view, view),
			),
		);
	if (labels.length === 0) return 0;
	await db.insert(communityLabels).values(
		labels.map((l) => ({
			ownerUrn,
			view,
			communityId: l.id,
			name: l.name,
			description: l.description,
			themes: l.themes,
		})),
	);
	return labels.length;
}
