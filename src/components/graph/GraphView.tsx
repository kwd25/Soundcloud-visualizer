"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CommunityLegend } from "./CommunityLegend";
import { GraphCanvas } from "./GraphCanvas";
import { InspectorPanel } from "./InspectorPanel";
import type { GraphNode, GraphPayload } from "./types";

export function GraphView() {
	const [data, setData] = useState<GraphPayload | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<GraphNode | null>(null);
	const [hidden, setHidden] = useState<Set<number>>(new Set());

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch("/api/graph", { cache: "no-store" });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const payload: GraphPayload = await res.json();
				if (!cancelled) setData(payload);
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
	}, []);

	const toggleCommunity = useCallback((id: number) => {
		setHidden((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	if (loading) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="glass-strong px-8 py-6 text-sm text-muted-foreground">
					Loading your graph…
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-screen items-center justify-center">
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
		);
	}

	if (!data || data.nodes.length === 0) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="glass-strong max-w-md space-y-3 px-8 py-6 text-center">
					<p className="text-sm">No graph yet.</p>
					<p className="text-xs text-muted-foreground">
						Head to the dashboard to start your first crawl. Once it finishes,
						your community graph will appear here.
					</p>
					<Link
						href="/dashboard"
						className="inline-flex rounded-md border border-[var(--jade)]/40 bg-[var(--jade)]/10 px-4 py-2 text-xs font-medium text-[var(--jade)] hover:bg-[var(--jade)]/20"
					>
						Go to dashboard
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="relative h-screen w-screen overflow-hidden">
			<GraphCanvas
				data={data}
				selectedUrn={selected?.urn ?? null}
				onSelectNode={setSelected}
				hiddenCommunities={hidden}
			/>

			{/* Header bar */}
			<header className="glass-strong pointer-events-auto absolute left-4 top-4 z-10 flex items-center gap-3 px-4 py-2">
				<Link
					href="/dashboard"
					className="text-xs text-muted-foreground hover:text-foreground"
				>
					← Dashboard
				</Link>
				<span className="h-3 w-px bg-white/10" />
				<p className="text-xs font-medium tracking-wide">
					Community graph ·{" "}
					<span className="text-muted-foreground">
						{data.nodes.length.toLocaleString()} nodes
					</span>
				</p>
			</header>

			<CommunityLegend
				data={data}
				hidden={hidden}
				onToggle={toggleCommunity}
				onSetAll={setHidden}
			/>

			<InspectorPanel node={selected} onClose={() => setSelected(null)} />
		</div>
	);
}
