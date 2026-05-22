"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CommunityLegend } from "./CommunityLegend";
import { GraphCanvas } from "./GraphCanvas";
import { InspectorPanel } from "./InspectorPanel";
import { clampPos, type PanePos } from "./Pane";
import {
	type CommunityLabels,
	type GraphPayload,
	MIN_VISIBLE_COMMUNITY_SIZE,
	type Selected,
} from "./types";

type ViewKind = "tracks" | "bipartite";

function loadStoredPos(key: string, fallback: PanePos): PanePos {
	if (typeof window === "undefined") return fallback;
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as Partial<PanePos>;
		if (typeof parsed.x === "number" && typeof parsed.y === "number") {
			return { x: parsed.x, y: parsed.y };
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
		loadStoredPos("graph-legend-xy", { x: 16, y: 80 }),
	);
	const [inspectorPos, setInspectorPos] = useState<PanePos>(() =>
		loadStoredPos("graph-inspector-xy", {
			x: typeof window === "undefined" ? 1200 : window.innerWidth - 416,
			y: 80,
		}),
	);

	const handleLegendPosChange = useCallback((next: PanePos) => {
		setLegendPos(next);
		persistPos("graph-legend-xy", next);
	}, []);
	const handleInspectorPosChange = useCallback((next: PanePos) => {
		setInspectorPos(next);
		persistPos("graph-inspector-xy", next);
	}, []);

	// Re-clamp positions when the viewport shrinks below their stored coords.
	useEffect(() => {
		const onResize = () => {
			const win = { w: window.innerWidth, h: window.innerHeight };
			setLegendPos((p) => clampPos(p, { w: 280, h: 200 }, win));
			setInspectorPos((p) => clampPos(p, { w: 320, h: 200 }, win));
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

			{/* Static top-layer navbar — not draggable, always on top. */}
			<header className="glass-strong pointer-events-auto absolute left-4 top-4 z-50 flex items-center gap-3 px-4 py-2">
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
			</header>

			{data && data.nodes.length > 0 && (
				<>
					<CommunityLegend
						data={data}
						hidden={hidden}
						onToggle={toggleCommunity}
						onSetAll={setHidden}
						labels={labels}
						pos={legendPos}
						onPosChange={handleLegendPosChange}
					/>
					<InspectorPanel
						selected={selected}
						view={view}
						labels={labels}
						onClose={() => setSelected(null)}
						pos={inspectorPos}
						onPosChange={handleInspectorPosChange}
					/>
				</>
			)}
		</div>
	);
}
