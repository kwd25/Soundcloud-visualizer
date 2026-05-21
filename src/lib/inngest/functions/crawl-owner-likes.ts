import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { authUsers, crawlJobs } from "@/lib/db/schema";
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
import {
	collect,
	SoundCloudClient,
	SoundCloudError,
	type SoundCloudTrack,
	type SoundCloudUser,
} from "@/lib/soundcloud";
import { inngest } from "../client";
import {
	clearOwnerEdges,
	type EdgeRow,
	insertEdges,
	upsertTracksAndUploaders,
	upsertUsers,
} from "../persist";

/** Defaults — tunable per-event for testing. */
const DEFAULT_SEED_CAP = 2000;
const DEFAULT_FAVORITERS_CAP = 200;
/** Group this many seed tracks per step.run() to keep total step count low. */
const EXPAND_BATCH_SIZE = 50;

export const crawlOwnerLikes = inngest.createFunction(
	{
		id: "crawl-owner-likes",
		name: "Crawl owner's community graph",
		concurrency: { limit: 1, key: "event.data.ownerUrn" },
		retries: 1,
		triggers: [{ event: "crawl/requested" }],
	},
	async ({ event, step, logger }) => {
		const data = event.data as {
			ownerUrn: string;
			seedCap?: number;
			favoritersCap?: number;
		};
		const { ownerUrn } = data;
		const seedCap = data.seedCap ?? DEFAULT_SEED_CAP;
		const favoritersCap = data.favoritersCap ?? DEFAULT_FAVORITERS_CAP;

		// ── 0. INIT — open a crawl_jobs row ──
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
			// ── 1. SEED — fetch owner's likes + persist owner+uploader edges ──
			const seedUrns = await step.run("seed-likes", async () => {
				const client = new SoundCloudClient(ownerUrn);
				const seedTracks = await collect<SoundCloudTrack>(
					client,
					"/me/likes/tracks",
					{ max: seedCap },
				);
				await upsertTracksAndUploaders(seedTracks);

				await clearOwnerEdges(ownerUrn);
				const seedEdges: EdgeRow[] = [];
				for (const t of seedTracks) {
					seedEdges.push({
						srcUrn: ownerUrn,
						dstUrn: t.urn,
						edgeType: "liked",
					});
					seedEdges.push({
						srcUrn: t.user.urn,
						dstUrn: t.urn,
						edgeType: "liked",
					});
				}
				await insertEdges(ownerUrn, seedEdges);

				logger.info("seed complete", {
					ownerUrn,
					seedTracks: seedTracks.length,
				});

				await db
					.update(crawlJobs)
					.set({ nodesDiscovered: seedTracks.length })
					.where(eq(crawlJobs.id, jobId));

				return seedTracks.map((t) => t.urn);
			});

			// ── 2. EXPAND — batched. Each step.run processes a batch of seeds. ──
			let totalEdges = seedUrns.length * 2;
			let totalUsers = 0;
			const batchCount = Math.ceil(seedUrns.length / EXPAND_BATCH_SIZE);

			for (let b = 0; b < batchCount; b++) {
				const start = b * EXPAND_BATCH_SIZE;
				const end = Math.min(start + EXPAND_BATCH_SIZE, seedUrns.length);
				const batchUrns = seedUrns.slice(start, end);

				const stepResult = await step.run(
					`expand-batch-${b.toString().padStart(3, "0")}`,
					async () => {
						const client = new SoundCloudClient(ownerUrn);
						let batchUsers = 0;
						let batchEdges = 0;

						for (const trackUrn of batchUrns) {
							try {
								const favoriters = await collect<SoundCloudUser>(
									client,
									`/tracks/${encodeURIComponent(trackUrn)}/favoriters`,
									{ max: favoritersCap },
								);

								if (favoriters.length === 0) continue;

								await upsertUsers(favoriters);

								const edgeRows: EdgeRow[] = favoriters.map((u) => ({
									srcUrn: u.urn,
									dstUrn: trackUrn,
									edgeType: "liked" as const,
								}));
								await insertEdges(ownerUrn, edgeRows);

								batchUsers += favoriters.length;
								batchEdges += edgeRows.length;
							} catch (err) {
								if (err instanceof SoundCloudError && err.status === 403) {
									continue;
								}
								throw err;
							}
						}

						return { users: batchUsers, edges: batchEdges };
					},
				);

				totalEdges += stepResult.edges;
				totalUsers += stepResult.users;

				await db
					.update(crawlJobs)
					.set({
						nodesDiscovered: seedUrns.length + totalUsers,
						edgesDiscovered: totalEdges,
					})
					.where(eq(crawlJobs.id, jobId));
			}

			// ── 3. PROJECTION — track ↔ track co-listener edges ──
			const projectionResult = await step.run("projection", async () => {
				const coEdges = await computeCoListenerEdges(ownerUrn, {
					minWeight: 3,
				});
				await persistCoListenerEdges(ownerUrn, coEdges);
				return { count: coEdges.length };
			});

			// ── 4. LAYOUT — bipartite ──
			const bipartiteResult = await step.run("layout-bipartite", async () => {
				const graph = await buildGraphForOwner({
					view: "bipartite",
					ownerUrn,
					minDegree: 2,
				});
				if (graph.order === 0) return { nodes: 0, edges: 0 };

				const { count, modularity } = assignCommunities(graph);
				assignLayout(graph, 250);
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

			// ── 5. LAYOUT — tracks (small graph, can use more iterations) ──
			const tracksResult = await step.run("layout-tracks", async () => {
				const graph = await buildGraphForOwner({
					view: "tracks",
					ownerUrn,
				});
				if (graph.order === 0) return { nodes: 0, edges: 0 };

				const { count, modularity } = assignCommunities(graph);
				assignLayout(graph, 500);
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

			logger.info("layout complete", {
				ownerUrn,
				projection: projectionResult,
				bipartite: bipartiteResult,
				tracks: tracksResult,
			});

			// ── 6. FINALIZE ──
			await step.run("finalize", async () => {
				const finishedAt = new Date();
				await db
					.update(crawlJobs)
					.set({
						status: "done",
						finishedAt,
						nodesDiscovered: seedUrns.length + totalUsers,
						edgesDiscovered: totalEdges,
					})
					.where(eq(crawlJobs.id, jobId));

				await db
					.update(authUsers)
					.set({ lastCrawledAt: finishedAt })
					.where(eq(authUsers.soundcloudUrn, ownerUrn));
			});

			return {
				jobId,
				ownerUrn,
				seedTracks: seedUrns.length,
				totalUsers,
				totalEdges,
				projection: projectionResult,
				bipartite: bipartiteResult,
				tracks: tracksResult,
			};
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
