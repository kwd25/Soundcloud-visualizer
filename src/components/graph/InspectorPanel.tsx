"use client";

import type { GraphNode } from "./types";

interface Props {
	node: GraphNode | null;
	onClose: () => void;
}

export function InspectorPanel({ node, onClose }: Props) {
	if (!node) return null;

	const isTrack = node.kind === "track";
	const widgetUrl =
		isTrack && node.permalink_url
			? `https://w.soundcloud.com/player/?url=${encodeURIComponent(node.permalink_url)}&color=%2378dcb4&auto_play=false&hide_related=true&show_user=true&visual=false`
			: null;

	return (
		<div className="glass-strong pointer-events-auto absolute right-4 top-4 z-10 w-96 max-w-[calc(100vw-2rem)] overflow-hidden">
			<div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
				<div className="flex items-center gap-2">
					<span
						className={`size-2 rounded-full ${isTrack ? "bg-[var(--jade)]" : "bg-[var(--amethyst)]"} shadow-[0_0_8px_currentColor]`}
					/>
					<span className="text-xs uppercase tracking-widest text-muted-foreground">
						{isTrack ? "Track" : "User"}
					</span>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
				>
					Close
				</button>
			</div>

			<div className="space-y-4 p-4">
				{!isTrack && node.avatar_url && (
					// biome-ignore lint/performance/noImgElement: external SoundCloud avatar
					<img
						src={node.avatar_url}
						alt={node.label ?? ""}
						className="size-16 rounded-full border border-white/10"
					/>
				)}

				<div>
					<h2 className="break-words text-lg font-semibold leading-tight">
						{node.label ?? "(no title)"}
					</h2>
					{!isTrack && node.followers_count != null && (
						<p className="mt-1 text-xs text-muted-foreground">
							{node.followers_count.toLocaleString()} followers
						</p>
					)}
					{isTrack && node.likes_count != null && (
						<p className="mt-1 text-xs text-muted-foreground">
							{node.likes_count.toLocaleString()} likes on SoundCloud
						</p>
					)}
				</div>

				{widgetUrl && (
					<div className="overflow-hidden rounded-lg border border-white/10">
						<iframe
							key={node.urn}
							title={`SoundCloud player for ${node.label}`}
							width="100%"
							height="120"
							scrolling="no"
							frameBorder="no"
							allow="autoplay"
							src={widgetUrl}
						/>
					</div>
				)}

				{node.community != null && (
					<div className="text-xs text-muted-foreground">
						Community{" "}
						<span className="font-mono text-foreground">#{node.community}</span>
					</div>
				)}

				<div className="break-all text-[10px] font-mono text-muted-foreground/60">
					{node.urn}
				</div>

				{node.permalink_url && (
					<a
						href={node.permalink_url}
						target="_blank"
						rel="noreferrer noopener"
						className="inline-flex w-full items-center justify-center rounded-md border border-[var(--jade)]/40 bg-[var(--jade)]/10 px-4 py-2 text-xs font-medium text-[var(--jade)] transition hover:bg-[var(--jade)]/20"
					>
						Open on SoundCloud ↗
					</a>
				)}
			</div>
		</div>
	);
}
