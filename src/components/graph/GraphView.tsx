"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CommunityLegend } from "./CommunityLegend";
import { GraphCanvas } from "./GraphCanvas";
import { InspectorPanel } from "./InspectorPanel";
import {
	type GraphPayload,
	MIN_VISIBLE_COMMUNITY_SIZE,
	type Selected,
} from "./types";

type ViewKind = "tracks" | "bipartite";

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

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setData(null);
		setSelected(null);
		(async () => {
			try {
				const res = await fetch(`/api/graph?view=${view}`, {
					cache: "no-store",
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const payload: GraphPayload = await res.json();
				if (cancelled) return;
				setData(payload);

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

			<header className="glass-strong pointer-events-auto absolute left-4 top-4 z-10 flex items-center gap-3 px-4 py-2">
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
					/>
					<InspectorPanel
						selected={selected}
						view={view}
						onClose={() => setSelected(null)}
					/>
				</>
			)}
		</div>
	);
}
