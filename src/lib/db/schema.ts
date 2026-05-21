import { sql } from "drizzle-orm";
import {
	index,
	integer,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const authUsers = pgTable(
	"auth_users",
	{
		id: uuid().primaryKey().defaultRandom(),
		soundcloudUrn: text().notNull().unique(),
		username: text(),
		avatarUrl: text(),
		accessToken: text().notNull(),
		refreshToken: text().notNull(),
		tokenExpiresAt: timestamp({ withTimezone: true }).notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().default(sql`now()`),
		lastCrawledAt: timestamp({ withTimezone: true }),
	},
	(t) => [index("auth_users_urn_idx").on(t.soundcloudUrn)],
);

export const users = pgTable("users", {
	urn: text().primaryKey(),
	username: text(),
	avatarUrl: text(),
	permalinkUrl: text(),
	followersCount: integer(),
	fetchedAt: timestamp({ withTimezone: true }).notNull().default(sql`now()`),
});

export const tracks = pgTable(
	"tracks",
	{
		urn: text().primaryKey(),
		title: text(),
		permalinkUrl: text(),
		artworkUrl: text(),
		uploaderUrn: text().references(() => users.urn, { onDelete: "set null" }),
		likesCount: integer(),
		playbackCount: integer(),
		fetchedAt: timestamp({ withTimezone: true }).notNull().default(sql`now()`),
	},
	(t) => [index("tracks_uploader_idx").on(t.uploaderUrn)],
);

export const edges = pgTable(
	"edges",
	{
		ownerUrn: text()
			.notNull()
			.references(() => authUsers.soundcloudUrn, { onDelete: "cascade" }),
		srcUrn: text().notNull(),
		dstUrn: text().notNull(),
		edgeType: text().notNull(),
		weight: real().notNull().default(1),
	},
	(t) => [
		primaryKey({ columns: [t.ownerUrn, t.srcUrn, t.dstUrn, t.edgeType] }),
		index("edges_owner_idx").on(t.ownerUrn),
		index("edges_src_idx").on(t.ownerUrn, t.srcUrn),
		index("edges_dst_idx").on(t.ownerUrn, t.dstUrn),
	],
);

export const layout = pgTable(
	"layout",
	{
		ownerUrn: text()
			.notNull()
			.references(() => authUsers.soundcloudUrn, { onDelete: "cascade" }),
		nodeUrn: text().notNull(),
		x: real().notNull(),
		y: real().notNull(),
		communityId: integer(),
	},
	(t) => [
		primaryKey({ columns: [t.ownerUrn, t.nodeUrn] }),
		index("layout_owner_idx").on(t.ownerUrn),
		index("layout_community_idx").on(t.ownerUrn, t.communityId),
	],
);

export const crawlJobs = pgTable(
	"crawl_jobs",
	{
		id: uuid().primaryKey().defaultRandom(),
		ownerUrn: text()
			.notNull()
			.references(() => authUsers.soundcloudUrn, { onDelete: "cascade" }),
		status: text().notNull(),
		nodesDiscovered: integer().notNull().default(0),
		edgesDiscovered: integer().notNull().default(0),
		startedAt: timestamp({ withTimezone: true }),
		finishedAt: timestamp({ withTimezone: true }),
		error: text(),
		createdAt: timestamp({ withTimezone: true }).notNull().default(sql`now()`),
	},
	(t) => [index("crawl_jobs_owner_idx").on(t.ownerUrn)],
);

export type AuthUser = typeof authUsers.$inferSelect;
export type NewAuthUser = typeof authUsers.$inferInsert;
export type User = typeof users.$inferSelect;
export type Track = typeof tracks.$inferSelect;
export type Edge = typeof edges.$inferSelect;
export type LayoutNode = typeof layout.$inferSelect;
export type CrawlJob = typeof crawlJobs.$inferSelect;
