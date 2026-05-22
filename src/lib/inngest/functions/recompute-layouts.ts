import { eq } from "drizzle-orm";
import {
	type CommunityContext,
	type CommunityLabel,
	chunkContexts,
	chunkDrafts,
	fetchCommunityContexts,
	labelDraftChunk,
	labelRefineChunk,
	persistLabels,
} from "@/lib/ai/labeler";
import { db } from "@/lib/db";
import { crawlJobs } from "@/lib/db/schema";
import {
	assignCommunities,
	assignLayout,
	buildGraphForOwner,
	clearOwnerLayout,
	computeCoListenerEdges,
	graphToLayoutRows,
	insertLayout,
	persistCoListenerEdges,
} from "@/lib/graph";
import { inngest } from "../client";

/**
 * Recompute the projection + both layouts using the EXISTING edges in the DB
 * (no SoundCloud crawl). Useful when iterating on the layout pipeline without
 * paying the ~10-minute crawl cost again.
 *
 * Steps mirror the layout half of crawl-owner-likes so per-step budget stays
 * within the 60s Hobby ceiling.
 */
export const recomputeLayouts = inngest.createFunction(
	{
		id: "recompute-layouts",
		name: "Recompute community graph layouts",
		concurrency: { limit: 1, key: "event.data.ownerUrn" },
		retries: 3,
		triggers: [{ event: "layouts/requested" }],
	},
	async ({ event, step, logger }) => {
		const { ownerUrn } = event.data as { ownerUrn: string };

		const jobId = await step.run("init", async () => {
			const [job] = await db
				.insert(crawlJobs)
				.values({
					ownerUrn,
					status: "running",
					startedAt: new Date(),
				})
				.returning({ id: crawlJobs.id });
			if (!job) throw new Error("failed to create crawl_jobs row");
			return job.id;
		});

		try {
			const projection = await step.run("projection", async () => {
				const co = await computeCoListenerEdges(ownerUrn, { minWeight: 3 });
				await persistCoListenerEdges(ownerUrn, co);
				return { count: co.length };
			});

			const bipartite = await step.run("layout-bipartite", async () => {
				const graph = await buildGraphForOwner({
					view: "bipartite",
					ownerUrn,
					minDegree: 3,
				});
				if (graph.order === 0) return { nodes: 0, edges: 0 };
				const { count, modularity } = assignCommunities(graph);
				assignLayout(graph, {
					iterations: 150,
					scalingRatio: 15,
					adjustSizes: true,
				});
				const rows = graphToLayoutRows(ownerUrn, "bipartite", graph);
				await clearOwnerLayout(ownerUrn, "bipartite");
				await insertLayout(rows);
				return {
					nodes: graph.order,
					edges: graph.size,
					communities: count,
					modularity,
				};
			});

			const tracks = await step.run("layout-tracks", async () => {
				const graph = await buildGraphForOwner({ view: "tracks", ownerUrn });
				if (graph.order === 0) return { nodes: 0, edges: 0 };
				const { count, modularity } = assignCommunities(graph);
				assignLayout(graph, {
					iterations: 600,
					scalingRatio: 50,
					gravity: 0.5,
					adjustSizes: true,
					linLogMode: true,
				});
				const rows = graphToLayoutRows(ownerUrn, "tracks", graph);
				await clearOwnerLayout(ownerUrn, "tracks");
				await insertLayout(rows);
				return {
					nodes: graph.order,
					edges: graph.size,
					communities: count,
					modularity,
				};
			});

			// ── AI labels for the tracks view ──
			// Each chunk is its own step.run() so Inngest retries individual
			// chunks on transient Anthropic overloads / 529s.
			const labelContext = await step.run("label-context", async () => {
				const ctxs = await fetchCommunityContexts(ownerUrn);
				return ctxs as CommunityContext[];
			});

			const draftChunks = chunkContexts(labelContext);
			const drafts: CommunityLabel[] = [];
			for (let i = 0; i < draftChunks.length; i++) {
				const group = draftChunks[i];
				if (!group) continue;
				const part = await step.run(
					`label-draft-${i.toString().padStart(2, "0")}`,
					async () => labelDraftChunk(group),
				);
				drafts.push(...part);
			}

			const refineChunks =
				drafts.length === 0
					? []
					: drafts.length <= 16
						? [drafts]
						: chunkDrafts(drafts);
			const refined: CommunityLabel[] = [];
			for (let i = 0; i < refineChunks.length; i++) {
				const group = refineChunks[i];
				if (!group) continue;
				const groupIds = new Set(group.map((d) => d.id));
				const others = drafts
					.filter((d) => !groupIds.has(d.id))
					.map((d) => ({ id: d.id, name: d.name }));
				const part = await step.run(
					`label-refine-${i.toString().padStart(2, "0")}`,
					async () => labelRefineChunk(group, labelContext, others),
				);
				refined.push(...part);
			}

			const labelsCount = await step.run("label-persist", async () => {
				if (refined.length === 0) return 0;
				return await persistLabels(ownerUrn, "tracks", refined);
			});

			logger.info("recompute complete", {
				ownerUrn,
				projection,
				bipartite,
				tracks,
				labels: {
					drafted: drafts.length,
					refined: refined.length,
					persisted: labelsCount,
				},
			});

			await step.run("finalize", async () => {
				await db
					.update(crawlJobs)
					.set({
						status: "done",
						finishedAt: new Date(),
					})
					.where(eq(crawlJobs.id, jobId));
			});

			return { jobId, projection, bipartite, tracks };
		} catch (error) {
			await db
				.update(crawlJobs)
				.set({
					status: "failed",
					finishedAt: new Date(),
					error: error instanceof Error ? error.message : String(error),
				})
				.where(eq(crawlJobs.id, jobId));
			throw error;
		}
	},
);
