import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { db } from "@/lib/db";
import { communityLabels } from "@/lib/db/schema";

// Haiku for speed — Sonnet's output rate (~50 tok/s) blew the 60s Vercel
// budget when emitting ~4-5k tokens of structured labels. Haiku is 4-5×
// faster and handles this pattern-matching task well.
const MODEL_ID = "claude-haiku-4-5";
/** Top N tracks per community we include in the prompt context. */
const TRACKS_PER_COMMUNITY = 12;
/** Skip communities smaller than this when labeling. Their labels stay #N. */
const MIN_COMMUNITY_SIZE_TO_LABEL = 3;
/** How many communities to label in a single Anthropic call. */
const CHUNK_SIZE = 8;

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

const PASS_1_SYSTEM = `You are a music journalist with the instincts of a perfumer and a novelist. You're labeling musical communities clustered from a user's SoundCloud likes — each cluster's tracks share many listeners, so it represents a real scene, mood, or aesthetic.

Give each community a label that captures its *feeling* through analogy, not its genre.

### Names (2-5 words)
- Use sensory and material imagery: textures, tastes, smells, weather, materials, colors, animals, plants, places, objects.
- Aim for unexpected combinations that still ring true: "Velvet Submersion" (slowed+reverb), "Strawberry Static" (hyperpop), "Iron-Pulse Cathedral" (hardstyle), "Cherry Cola Skyway" (nightcore), "Damp Concrete Memory" (UK rave), "Mothlight Lullaby" (ambient), "Glass Hailstorm" (breakcore), "Stuffed-Animal Apocalypse" (emo-rave), "Plastic Lightning" (hyperclub glitch).
- FORBIDDEN words: "SoundCloud", "Bootleg", "Remix", "Edit", "Mix", "Vibes", "Anthems", and any literal genre name on its own ("Nightcore", "Hardstyle", "Hyperpop", "Phonk") unless transformed into something imagistic.
- No two communities can share dominant imagery — if you used "velvet" once, don't use it again. Use a different sense for each one.

### Description (2-3 sentences)
- Place the listener somewhere specific: a bedroom at 3am, a damp parking garage, a humid greenhouse, the dashboard of a 2007 sedan, a stairwell with one fluorescent bulb.
- Anchor ONE concrete sonic detail (BPM range, vocal style, production trick like "pitch-shifted breath samples" or "hardstyle screech kicks") inside the imagery so the description is recognizably about real music.
- Be brave and weird. Reach for poetry. Avoid catalog-speak.

### Themes (3-6 lowercase tags, hyphens ok)
- Mix of mood/texture words AND a couple of genre-adjacent terms so the tags are useful for search later. Example: ["velvety", "submerged", "lovesick", "slowed-reverb", "night-driving", "pitched-down"].

You'll get a batch of communities with their representative tracks. Be playful and confident — these labels will be how the user navigates their entire taste landscape.`;

const PASS_2_SYSTEM = `You are refining draft community labels. The voice is fantastical, sensory, slightly oblique — names should feel like "Velvet Submersion", "Strawberry Static", "Iron-Pulse Cathedral", "Cherry Cola Skyway", "Damp Concrete Memory", "Stuffed-Animal Apocalypse". They are NEVER literal genre tags ("Nightcore", "Hardstyle"), platform terms ("SoundCloud", "Bootleg", "Remix"), or catalog-speak.

Three refinement goals:

1. KILL LITERALISM — Any draft that still names a genre directly, mentions the platform, or reads like a record-store sticker MUST be rewritten into imagery. Use materials, weather, food, animals, plants, places, objects, colors, body sensations.

2. DISTINCT WORLDS — Scan all drafts together. If two names share dominant imagery (both "velvet", both "neon", both "sugar"), revise one or both so they inhabit different worlds. Think different seasons, different rooms, different climates, different decades. Each community should feel like its own atmosphere.

3. RICHER DESCRIPTIONS — Expand each description to 2-3 sentences. Place the listener somewhere specific (a stairwell, a parking lot, a greenhouse, a 2007 sedan dashboard). Anchor ONE concrete sonic detail (BPM, vocal style, production move) inside the imagery so the description is recognizably about real music.

Preserve drafts that already feel striking and imagistic — only revise where there's real improvement. Themes can stay practical-ish.`;

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
		temperature: 0.95,
		maxRetries: 1,
	});
	return object.communities;
}

export function chunkContexts(
	ctxs: CommunityContext[],
	size: number = CHUNK_SIZE,
): CommunityContext[][] {
	const out: CommunityContext[][] = [];
	for (let i = 0; i < ctxs.length; i += size) out.push(ctxs.slice(i, i + size));
	return out;
}

export function chunkDrafts(
	drafts: CommunityLabel[],
	size: number = CHUNK_SIZE,
): CommunityLabel[][] {
	const out: CommunityLabel[][] = [];
	for (let i = 0; i < drafts.length; i += size) {
		out.push(drafts.slice(i, i + size));
	}
	return out;
}

/**
 * Label one chunk of communities (pass 1 — draft). Each call here is a
 * single Anthropic request. Designed to be wrapped in step.run() so
 * Inngest can retry individual chunks on transient overloads.
 */
export async function labelDraftChunk(
	group: CommunityContext[],
): Promise<CommunityLabel[]> {
	if (group.length === 0) return [];
	return await callLLM(PASS_1_SYSTEM, buildPass1Prompt(group));
}

/**
 * Refine one chunk of drafts (pass 2). When called for a chunk that's part
 * of a bigger set, pass `otherNames` so the AI keeps cross-community
 * distinctness in mind.
 */
export async function labelRefineChunk(
	group: CommunityLabel[],
	ctxs: CommunityContext[],
	otherNames?: Array<{ id: number; name: string }>,
): Promise<CommunityLabel[]> {
	if (group.length === 0) return [];
	const groupIds = new Set(group.map((d) => d.id));
	const groupCtxs = ctxs.filter((c) => groupIds.has(c.id));
	let prompt = buildPass2Prompt(groupCtxs, group);
	if (otherNames && otherNames.length > 0) {
		prompt += `\n\nFor cross-community distinctness, here are the names of OTHER communities not in this chunk (do not return labels for these — just avoid using overlapping names):\n${otherNames.map((n) => `  #${n.id}: ${n.name}`).join("\n")}`;
	}
	return await callLLM(PASS_2_SYSTEM, prompt);
}

/** Convenience for callers that want the full pipeline in one place
 * (e.g. tests). The Inngest function should call labelDraftChunk +
 * labelRefineChunk per step.run() instead for retry granularity. */
export async function labelDraft(
	ctxs: CommunityContext[],
): Promise<CommunityLabel[]> {
	const all: CommunityLabel[] = [];
	for (const group of chunkContexts(ctxs)) {
		all.push(...(await labelDraftChunk(group)));
	}
	return all;
}

export async function labelRefine(
	ctxs: CommunityContext[],
	drafts: CommunityLabel[],
): Promise<CommunityLabel[]> {
	if (drafts.length === 0) return [];
	if (drafts.length <= CHUNK_SIZE * 2) {
		return await labelRefineChunk(drafts, ctxs);
	}
	const all: CommunityLabel[] = [];
	for (const group of chunkDrafts(drafts)) {
		const groupIds = new Set(group.map((d) => d.id));
		const others = drafts
			.filter((d) => !groupIds.has(d.id))
			.map((d) => ({ id: d.id, name: d.name }));
		all.push(...(await labelRefineChunk(group, ctxs, others)));
	}
	return all;
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
