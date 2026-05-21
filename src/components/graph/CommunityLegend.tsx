"use client";

import { useMemo, useState } from "react";
import { communityPalette } from "./community-colors";
import { type GraphPayload, MIN_VISIBLE_COMMUNITY_SIZE } from "./types";

interface Props {
	data: GraphPayload;
	hidden: Set<number>;
	onToggle: (community: number) => void;
	onSetAll: (next: Set<number>) => void;
}

export function CommunityLegend({ data, hidden, onToggle, onSetAll }: Props) {
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
		<aside className="glass-strong pointer-events-auto absolute bottom-4 left-4 z-10 max-h-[70vh] w-64 overflow-hidden">
			<div className="border-b border-white/10 px-4 py-3">
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
			<div className="max-h-[52vh] space-y-1 overflow-y-auto p-2">
				{visible.map(({ id, count, color }) => {
					const isHidden = hidden.has(id);
					return (
						<button
							type="button"
							key={id}
							onClick={() => onToggle(id)}
							className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-white/5 ${
								isHidden ? "opacity-40" : ""
							}`}
						>
							<span
								className="size-3 shrink-0 rounded-full"
								style={{ backgroundColor: color }}
							/>
							<span className="flex-1 font-mono text-foreground/80">#{id}</span>
							<span className="font-mono text-muted-foreground">
								{count.toLocaleString()}
							</span>
						</button>
					);
				})}
			</div>
		</aside>
	);
}
