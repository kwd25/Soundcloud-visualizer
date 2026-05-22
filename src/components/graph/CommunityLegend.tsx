"use client";

import { useMemo, useState } from "react";
import { communityPalette } from "./community-colors";
import { Pane, type PanePos } from "./Pane";
import {
	type CommunityLabels,
	type GraphPayload,
	MIN_VISIBLE_COMMUNITY_SIZE,
} from "./types";

interface Props {
	data: GraphPayload;
	hidden: Set<number>;
	onToggle: (community: number) => void;
	onSetAll: (next: Set<number>) => void;
	labels: CommunityLabels;
	pos: PanePos;
	onPosChange: (next: PanePos) => void;
}

export function CommunityLegend({
	data,
	hidden,
	onToggle,
	onSetAll,
	labels,
	pos,
	onPosChange,
}: Props) {
	const [showSmall, setShowSmall] = useState(false);

	const { visible, smallCount } = useMemo(() => {
		const counts = new Map<number, number>();
		for (const n of data.nodes) {
			if (n.community == null) continue;
			counts.set(n.community, (counts.get(n.community) ?? 0) + 1);
		}
		const max =
			data.nodes.reduce(
				(acc, n) =>
					n.community != null && n.community > acc ? n.community : acc,
				0,
			) + 1;
		const palette = communityPalette(max);
		const allSorted = Array.from(counts.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([id, count]) => ({ id, count, color: palette[id] }));
		const filtered = showSmall
			? allSorted
			: allSorted.filter((c) => c.count > MIN_VISIBLE_COMMUNITY_SIZE);
		const smallCount = allSorted.length - filtered.length;
		return { visible: filtered, smallCount };
	}, [data, showSmall]);

	const allVisible = hidden.size === 0;
	const visibleIds = useMemo(() => visible.map((s) => s.id), [visible]);
	const allHidden = visibleIds.every((id) => hidden.has(id));

	return (
		<Pane
			pos={pos}
			onPosChange={onPosChange}
			defaultSize={{ w: 280, h: 520 }}
			minSize={{ w: 220, h: 280 }}
			storageKey="graph-legend-pane"
			className="glass-strong"
		>
			<div className="flex h-full w-full flex-col">
				<div
					data-drag-handle
					className="shrink-0 cursor-grab border-b border-white/10 px-4 py-3 active:cursor-grabbing"
				>
					<p className="text-xs uppercase tracking-widest text-muted-foreground">
						Communities
					</p>
					<p className="mt-1 text-xs text-foreground/80">
						{visible.length}
						{smallCount > 0 && (
							<span className="text-muted-foreground">
								{" "}
								of {visible.length + smallCount}
							</span>
						)}{" "}
						clusters · {data.nodes.length.toLocaleString()} nodes
					</p>
					<div className="mt-3 grid grid-cols-2 gap-2">
						<button
							type="button"
							onClick={() => onSetAll(new Set())}
							disabled={allVisible}
							className="rounded-md border border-[var(--jade)]/30 bg-[var(--jade)]/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--jade)] transition hover:bg-[var(--jade)]/20 disabled:opacity-40"
						>
							Select all
						</button>
						<button
							type="button"
							onClick={() => onSetAll(new Set(visibleIds))}
							disabled={allHidden}
							className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-foreground/70 transition hover:bg-white/10 disabled:opacity-40"
						>
							Deselect all
						</button>
					</div>
					{smallCount > 0 && (
						<button
							type="button"
							onClick={() => setShowSmall((v) => !v)}
							className="mt-2 w-full text-left text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
						>
							{showSmall ? "Hide" : "Show"} {smallCount} small (≤
							{MIN_VISIBLE_COMMUNITY_SIZE})
						</button>
					)}
				</div>
				<div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
					{visible.map(({ id, count, color }) => {
						const isHidden = hidden.has(id);
						const label = labels[id];
						return (
							<button
								type="button"
								key={id}
								onClick={() => onToggle(id)}
								title={label?.description ?? undefined}
								className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-white/5 ${
									isHidden ? "opacity-40" : ""
								}`}
							>
								<span
									className="size-3 shrink-0 rounded-full"
									style={{ backgroundColor: color }}
								/>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-foreground/90">
										{label?.name ?? `#${id}`}
									</span>
									{label?.name && (
										<span className="block truncate font-mono text-[10px] text-muted-foreground">
											#{id}
										</span>
									)}
								</span>
								<span className="font-mono text-muted-foreground">
									{count.toLocaleString()}
								</span>
							</button>
						);
					})}
				</div>
			</div>
		</Pane>
	);
}
