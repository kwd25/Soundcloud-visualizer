import { and, eq } from "drizzle-orm";
import type Graph from "graphology";
import { db } from "@/lib/db";
import { layout } from "@/lib/db/schema";
import type { ViewKind } from "./build";

const BATCH_SIZE = 500;

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		out.push(arr.slice(i, i + size));
	}
	return out;
}

/** Wipe an owner's layout for one view before writing new positions. */
export async function clearOwnerLayout(
	ownerUrn: string,
	view: ViewKind,
): Promise<void> {
	await db
		.delete(layout)
		.where(and(eq(layout.ownerUrn, ownerUrn), eq(layout.view, view)));
}

interface LayoutRow {
	ownerUrn: string;
	nodeUrn: string;
	view: ViewKind;
	x: number;
	y: number;
	communityId: number | null;
}

export async function insertLayout(rows: LayoutRow[]): Promise<number> {
	if (rows.length === 0) return 0;
	let written = 0;
	for (const batch of chunk(rows, BATCH_SIZE)) {
		await db.insert(layout).values(batch);
		written += batch.length;
	}
	return written;
}

export function graphToLayoutRows(
	ownerUrn: string,
	view: ViewKind,
	graph: Graph,
): LayoutRow[] {
	const out: LayoutRow[] = [];
	graph.forEachNode((node, attrs) => {
		const x = typeof attrs.x === "number" ? attrs.x : 0;
		const y = typeof attrs.y === "number" ? attrs.y : 0;
		const community =
			typeof attrs.community === "number" ? attrs.community : null;
		out.push({ ownerUrn, nodeUrn: node, view, x, y, communityId: community });
	});
	return out;
}
