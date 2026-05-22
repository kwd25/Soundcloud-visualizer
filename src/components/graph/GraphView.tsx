"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CommunityLegend } from "./CommunityLegend";
import { GraphCanvas } from "./GraphCanvas";
import { InspectorPanel } from "./InspectorPanel";
import {
	clampAlong,
	type Edge,
	Pane,
	type PanePos,
	rectOf,
	rectsOverlap,
	type Size,
	VIEWPORT_PADDING,
} from "./Pane";
import {
	type CommunityLabels,
	type GraphPayload,
	MIN_VISIBLE_COMMUNITY_SIZE,
	type Selected,
} from "./types";

type ViewKind = "tracks" | "bipartite";
type PaneId = "legend" | "inspector" | "navbar";

const VALID_EDGES: Edge[] = ["top", "right", "bottom", "left"];
const PANE_GAP = 8;

function loadStoredPos(key: string, fallback: PanePos): PanePos {
	if (typeof window === "undefined") return fallback;
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as Partial<PanePos>;
		if (
			typeof parsed.edge === "string" &&
			(VALID_EDGES as string[]).includes(parsed.edge) &&
			typeof parsed.along === "number"
		) {
			return { edge: parsed.edge as Edge, along: parsed.along };
		}
	} catch {
		// noop
	}
	return fallback;
}

function persistPos(key: string, pos: PanePos): void {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(key, JSON.stringify(pos));
	} catch {
		// noop
	}
}

function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}

/**
 * Try `edge` starting at `startAlong`. Walk forward past any conflicts, then
 * walk backward past any conflicts. Returns the first non-overlapping `along`
 * value, or null if nothing fits on this edge.
 */
function findOpenSlot(
	edge: Edge,
	startAlong: number,
	size: Size,
	others: Array<{ pos: PanePos; size: Size }>,
	win: { w: number; h: number },
): number | null {
	const horiz = edge === "top" || edge === "bottom";
	const maxAlong = Math.max(
		VIEWPORT_PADDING,
		(horiz ? win.w - size.w : win.h - size.h) - VIEWPORT_PADDING,
	);
	const dim = horiz ? size.w : size.h;

	const conflictAt = (along: number) => {
		const candidate: PanePos = { edge, along };
		const candRect = rectOf(candidate, size, win);
		for (const other of others) {
			const otherRect = rectOf(other.pos, other.size, win);
			if (rectsOverlap(candRect, otherRect)) return otherRect;
		}
		return null;
	};

	// Forward sweep.
	let along = clamp(startAlong, VIEWPORT_PADDING, maxAlong);
	for (let i = 0; i < 16; i++) {
		const conflict = conflictAt(along);
		if (!conflict) return along;
		const next = (horiz ? conflict.x2 : conflict.y2) + PANE_GAP;
		if (next > maxAlong || next === along) break;
		along = next;
	}
	// Backward sweep from start.
	along = clamp(startAlong, VIEWPORT_PADDING, maxAlong);
	for (let i = 0; i < 16; i++) {
		const conflict = conflictAt(along);
		if (!conflict) return along;
		const back = (horiz ? conflict.x1 : conflict.y1) - dim - PANE_GAP;
		if (back < VIEWPORT_PADDING || back === along) break;
		along = back;
	}
	return null;
}

/**
 * Place a pane at the user's requested position, sliding it along the edge
 * (or evicting it to another edge) to avoid overlapping any other pane.
 */
function resolveCollision(
	desired: PanePos,
	size: Size,
	others: Array<{ pos: PanePos; size: Size }>,
	win: { w: number; h: number },
): PanePos {
	const edgesToTry: Edge[] = [
		desired.edge,
		...VALID_EDGES.filter((e) => e !== desired.edge),
	];
	for (const edge of edgesToTry) {
		const startAlong = edge === desired.edge ? desired.along : VIEWPORT_PADDING;
		const fit = findOpenSlot(edge, startAlong, size, others, win);
		if (fit !== null) return { edge, along: fit };
	}
	return desired;
}

const VIEW_LABEL: Record<ViewKind, string> = {
	tracks: "Tracks",
	bipartite: "People",
};

const VIEW_BLURB: Record<ViewKind, string> = {
	tracks: "Your tracks — clustered by shared listeners",
	bipartite: "You + the people who share your taste",
};

export function GraphView() {
	const [view, setView] = useState<ViewKind>("tracks");
	const [data, setData] = useState<GraphPayload | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<Selected | null>(null);
	const [hidden, setHidden] = useState<Set<number>>(new Set());
	const [labels, setLabels] = useState<CommunityLabels>({});

	const [legendPos, setLegendPos] = useState<PanePos>(() =>
		loadStoredPos("graph-legend-pos", { edge: "left", along: 80 }),
	);
	const [inspectorPos, setInspectorPos] = useState<PanePos>(() =>
		loadStoredPos("graph-inspector-pos", { edge: "right", along: 80 }),
	);
	const [navbarPos, setNavbarPos] = useState<PanePos>(() =>
		loadStoredPos("graph-navbar-pos", { edge: "top", along: 16 }),
	);

	const [legendSize, setLegendSize] = useState<Size>({ w: 280, h: 520 });
	const [inspectorSize, setInspectorSize] = useState<Size>({ w: 400, h: 620 });
	const [navbarSize, setNavbarSize] = useState<Size>({ w: 600, h: 48 });

	// Latest pos+size for collision resolution (sync with state).
	const posRef = useRef({ legendPos, inspectorPos, navbarPos });
	posRef.current = { legendPos, inspectorPos, navbarPos };
	const sizeRef = useRef({ legendSize, inspectorSize, navbarSize });
	sizeRef.current = { legendSize, inspectorSize, navbarSize };

	const handlePosChange = useCallback((paneId: PaneId, requested: PanePos) => {
		const win = { w: window.innerWidth, h: window.innerHeight };
		const sizes = sizeRef.current;
		const positions = posRef.current;
		const sizeOf = (id: PaneId): Size =>
			id === "legend"
				? sizes.legendSize
				: id === "inspector"
					? sizes.inspectorSize
					: sizes.navbarSize;
		const posOf = (id: PaneId): PanePos =>
			id === "legend"
				? positions.legendPos
				: id === "inspector"
					? positions.inspectorPos
					: positions.navbarPos;
		const others = (["legend", "inspector", "navbar"] as PaneId[])
			.filter((id) => id !== paneId)
			.map((id) => ({ pos: posOf(id), size: sizeOf(id) }));

		const resolved = resolveCollision(requested, sizeOf(paneId), others, win);

		if (paneId === "legend") {
			setLegendPos(resolved);
			persistPos("graph-legend-pos", resolved);
		} else if (paneId === "inspector") {
			setInspectorPos(resolved);
			persistPos("graph-inspector-pos", resolved);
		} else {
			setNavbarPos(resolved);
			persistPos("graph-navbar-pos", resolved);
		}
	}, []);

	// Re-clamp positions when the viewport shrinks below their `along` values.
	useEffect(() => {
		const onResize = () => {
			const win = { w: window.innerWidth, h: window.innerHeight };
			setLegendPos((p) => {
				const along = clampAlong(p, sizeRef.current.legendSize, win);
				return along === p.along ? p : { ...p, along };
			});
			setInspectorPos((p) => {
				const along = clampAlong(p, sizeRef.current.inspectorSize, win);
				return along === p.along ? p : { ...p, along };
			});
			setNavbarPos((p) => {
				const along = clampAlong(p, sizeRef.current.navbarSize, win);
				return along === p.along ? p : { ...p, along };
			});
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setData(null);
		setSelected(null);
		setLabels({});
		(async () => {
			try {
				const [graphRes, labelsRes] = await Promise.all([
					fetch(`/api/graph?view=${view}`, { cache: "no-store" }),
					fetch(`/api/communities?view=${view}`, { cache: "no-store" }),
				]);
				if (!graphRes.ok) throw new Error(`HTTP ${graphRes.status}`);
				const payload: GraphPayload = await graphRes.json();
				if (cancelled) return;
				setData(payload);

				if (labelsRes.ok) {
					const labelsJson = (await labelsRes.json()) as {
						labels: CommunityLabels;
					};
					if (!cancelled) setLabels(labelsJson.labels ?? {});
				}

				// Auto-hide communities at or below the size threshold.
				const counts = new Map<number, number>();
				for (const n of payload.nodes) {
					if (n.community != null) {
						counts.set(n.community, (counts.get(n.community) ?? 0) + 1);
					}
				}
				const small = new Set<number>();
				for (const [id, c] of counts) {
					if (c <= MIN_VISIBLE_COMMUNITY_SIZE) small.add(id);
				}
				setHidden(small);
			} catch (e) {
				if (!cancelled)
					setError(e instanceof Error ? e.message : "graph fetch failed");
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [view]);

	const toggleCommunity = useCallback((id: number) => {
		setHidden((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	return (
		<div className="relative h-screen w-screen overflow-hidden">
			{loading ? (
				<div className="flex h-full items-center justify-center">
					<div className="glass-strong px-8 py-6 text-sm text-muted-foreground">
						Loading {VIEW_LABEL[view].toLowerCase()} view…
					</div>
				</div>
			) : error ? (
				<div className="flex h-full items-center justify-center">
					<div className="glass-strong space-y-3 px-8 py-6 text-center">
						<p className="text-sm text-destructive">Graph failed to load</p>
						<p className="text-xs text-muted-foreground">{error}</p>
						<Link
							href="/dashboard"
							className="inline-flex text-xs text-[var(--jade)] underline-offset-4 hover:underline"
						>
							Back to dashboard
						</Link>
					</div>
				</div>
			) : !data || data.nodes.length === 0 ? (
				<div className="flex h-full items-center justify-center">
					<div className="glass-strong max-w-md space-y-3 px-8 py-6 text-center">
						<p className="text-sm">No graph data for this view yet.</p>
						<p className="text-xs text-muted-foreground">
							Head to the dashboard and run a crawl. Once it finishes, both
							views will populate.
						</p>
						<Link
							href="/dashboard"
							className="inline-flex rounded-md border border-[var(--jade)]/40 bg-[var(--jade)]/10 px-4 py-2 text-xs font-medium text-[var(--jade)] hover:bg-[var(--jade)]/20"
						>
							Go to dashboard
						</Link>
					</div>
				</div>
			) : (
				<GraphCanvas
					data={data}
					selected={selected}
					onSelect={setSelected}
					hiddenCommunities={hidden}
				/>
			)}

			<Pane
				pos={navbarPos}
				onPosChange={(next) => handlePosChange("navbar", next)}
				resizable={false}
				onMeasure={setNavbarSize}
				className="glass-strong"
			>
				<div
					data-drag-handle
					className="flex cursor-grab items-center gap-3 px-4 py-2 active:cursor-grabbing"
				>
					<Link
						href="/dashboard"
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						← Dashboard
					</Link>
					<span className="h-3 w-px bg-white/10" />
					<div className="flex items-center gap-1">
						{(["tracks", "bipartite"] as const).map((v) => (
							<button
								type="button"
								key={v}
								onClick={() => setView(v)}
								className={`rounded-md px-3 py-1 text-xs font-medium transition ${
									view === v
										? "bg-[var(--jade)]/15 text-[var(--jade)]"
										: "text-muted-foreground hover:bg-white/5 hover:text-foreground"
								}`}
							>
								{VIEW_LABEL[v]}
							</button>
						))}
					</div>
					<span className="h-3 w-px bg-white/10" />
					<p className="hidden text-xs text-muted-foreground sm:block">
						{data ? `${data.nodes.length.toLocaleString()} nodes · ` : ""}
						{VIEW_BLURB[view]}
					</p>
				</div>
			</Pane>

			{data && data.nodes.length > 0 && (
				<>
					<CommunityLegend
						data={data}
						hidden={hidden}
						onToggle={toggleCommunity}
						onSetAll={setHidden}
						labels={labels}
						pos={legendPos}
						onPosChange={(next) => handlePosChange("legend", next)}
						onMeasure={setLegendSize}
					/>
					<InspectorPanel
						selected={selected}
						view={view}
						labels={labels}
						onClose={() => setSelected(null)}
						pos={inspectorPos}
						onPosChange={(next) => handlePosChange("inspector", next)}
						onMeasure={setInspectorSize}
					/>
				</>
			)}
		</div>
	);
}
