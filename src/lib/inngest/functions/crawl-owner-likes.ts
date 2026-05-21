import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { authUsers, crawlJobs } from "@/lib/db/schema";
import { computeLayoutAndCommunities } from "@/lib/graph";
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
const DEFAULT_SEED_CAP = 500;
const DEFAULT_FAVORITERS_CAP = 200;

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

			// ── 2. EXPAND — for each seed track, fetch favoriters ──
			let totalEdges = seedUrns.length * 2;
			let totalUsers = 0;

			for (let i = 0; i < seedUrns.length; i++) {
				const trackUrn = seedUrns[i];
				if (!trackUrn) continue;

				const stepResult = await step.run(
					`expand-${i.toString().padStart(4, "0")}`,
					async () => {
						const client = new SoundCloudClient(ownerUrn);
						try {
							const favoriters = await collect<SoundCloudUser>(
								client,
								`/tracks/${encodeURIComponent(trackUrn)}/favoriters`,
								{ max: favoritersCap },
							);

							if (favoriters.length === 0) {
								return { favoriters: 0, edges: 0 };
							}

							await upsertUsers(favoriters);

							const edgeRows: EdgeRow[] = favoriters.map((u) => ({
								srcUrn: u.urn,
								dstUrn: trackUrn,
								edgeType: "liked" as const,
							}));
							await insertEdges(ownerUrn, edgeRows);

							return { favoriters: favoriters.length, edges: edgeRows.length };
						} catch (err) {
							if (err instanceof SoundCloudError && err.status === 403) {
								return { favoriters: 0, edges: 0, skipped: true };
							}
							throw err;
						}
					},
				);

				totalEdges += stepResult.edges;
				totalUsers += stepResult.favoriters;

				if (i % 10 === 9 || i === seedUrns.length - 1) {
					await db
						.update(crawlJobs)
						.set({
							nodesDiscovered: seedUrns.length + totalUsers,
							edgesDiscovered: totalEdges,
						})
						.where(eq(crawlJobs.id, jobId));
				}
			}

			// ── 3. LAYOUT — Louvain + ForceAtlas2 ──
			const layoutResult = await step.run("compute-layout", async () => {
				return await computeLayoutAndCommunities(ownerUrn);
			});

			logger.info("layout complete", {
				ownerUrn,
				...layoutResult,
			});

			// ── 4. FINALIZE ──
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
				communities: layoutResult.communities,
				modularity: layoutResult.modularity,
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
