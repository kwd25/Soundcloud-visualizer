"use client";

import { useMemo } from "react";
import { communityPalette } from "./community-colors";
import type { GraphPayload } from "./types";

interface Props {
	data: GraphPayload;
	hidden: Set<number>;
	onToggle: (community: number) => void;
}

export function CommunityLegend({ data, hidden, onToggle }: Props) {
	const sized = useMemo(() => {
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
		return Array.from(counts.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([id, count]) => ({ id, count, color: palette[id] }));
	}, [data]);

	return (
		<aside className="glass-strong pointer-events-auto absolute bottom-4 left-4 z-10 max-h-[60vh] w-64 overflow-hidden">
			<div className="border-b border-white/10 px-4 py-3">
				<p className="text-xs uppercase tracking-widest text-muted-foreground">
					Communities
				</p>
				<p className="mt-1 text-xs text-foreground/80">
					{sized.length} clusters · {data.nodes.length.toLocaleString()} nodes
				</p>
			</div>
			<div className="max-h-[48vh] space-y-1 overflow-y-auto p-2">
				{sized.map(({ id, count, color }) => {
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
