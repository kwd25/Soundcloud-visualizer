"use client";

import { useEffect, useState } from "react";
import type { CommunityLabels, GraphNode, Selected } from "./types";

interface Props {
	selected: Selected | null;
	view: "tracks" | "bipartite";
	labels: CommunityLabels;
	onClose: () => void;
}

interface EdgeDetail {
	weight: number;
	common_listeners: Array<{
		urn: string;
		username: string | null;
		avatar_url: string | null;
		permalink_url: string | null;
		followers_count: number | null;
	}>;
}

export function InspectorPanel({ selected, view, labels, onClose }: Props) {
	if (!selected) return null;

	if (selected.kind === "node") {
		return <NodePanel node={selected.node} labels={labels} onClose={onClose} />;
	}
	return (
		<EdgePanel
			src={selected.edge.src}
			dst={selected.edge.dst}
			weight={selected.edge.weight}
			view={view}
			onClose={onClose}
		/>
	);
}

function widgetUrlFor(track: GraphNode): string | null {
	if (track.kind !== "track" || !track.permalink_url) return null;
	return `https://w.soundcloud.com/player/?url=${encodeURIComponent(track.permalink_url)}&color=%2378dcb4&auto_play=false&hide_related=true&show_user=true&visual=false`;
}

function SoundCloudWidget({ track }: { track: GraphNode }) {
	const url = widgetUrlFor(track);
	if (!url) return null;
	return (
		<div className="overflow-hidden rounded-lg border border-white/10">
			<iframe
				key={track.urn}
				title={`SoundCloud player for ${track.label ?? track.urn}`}
				width="100%"
				height="120"
				scrolling="no"
				frameBorder="no"
				allow="autoplay"
				src={url}
			/>
		</div>
	);
}

/** Track title + SoundCloud widget — used per endpoint in the edge inspector. */
function TrackBlock({ track }: { track: GraphNode }) {
	return (
		<div className="space-y-2">
			<h3 className="break-words text-base font-semibold leading-tight">
				{track.label ?? "(no title)"}
			</h3>
			<SoundCloudWidget track={track} />
		</div>
	);
}

function NodePanel({
	node,
	labels,
	onClose,
}: {
	node: GraphNode;
	labels: CommunityLabels;
	onClose: () => void;
}) {
	const isTrack = node.kind === "track";
	const label = node.community != null ? labels[node.community] : undefined;

	return (
		<div className="glass-strong pointer-events-auto absolute right-4 top-4 z-10 w-96 max-w-[calc(100vw-2rem)] overflow-hidden">
			<HeaderRow
				label={isTrack ? "Track" : "User"}
				dotClass={isTrack ? "bg-[var(--jade)]" : "bg-[var(--amethyst)]"}
				onClose={onClose}
			/>

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

				{isTrack && <SoundCloudWidget track={node} />}

				{node.community != null && (
					<div className="space-y-1.5">
						<span className="inline-flex items-center gap-2 rounded-full border border-[var(--amethyst)]/40 bg-[var(--amethyst)]/10 px-3 py-1 text-xs font-medium text-[var(--amethyst)]">
							<span className="size-1.5 rounded-full bg-[var(--amethyst)]" />
							{label?.name ?? `Community #${node.community}`}
						</span>
						{label?.description && (
							<p className="text-xs leading-relaxed text-muted-foreground">
								{label.description}
							</p>
						)}
						{label?.themes && label.themes.length > 0 && (
							<div className="flex flex-wrap gap-1 pt-1">
								{label.themes.map((t) => (
									<span
										key={t}
										className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-foreground/70"
									>
										{t}
									</span>
								))}
							</div>
						)}
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

function EdgePanel({
	src,
	dst,
	weight,
	view,
	onClose,
}: {
	src: GraphNode;
	dst: GraphNode;
	weight: number;
	view: "tracks" | "bipartite";
	onClose: () => void;
}) {
	const [detail, setDetail] = useState<EdgeDetail | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (view !== "tracks") return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		setDetail(null);
		(async () => {
			try {
				const url = `/api/edge?src=${encodeURIComponent(src.urn)}&dst=${encodeURIComponent(dst.urn)}&view=${view}`;
				const res = await fetch(url, { cache: "no-store" });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data: EdgeDetail = await res.json();
				if (!cancelled) setDetail(data);
			} catch (e) {
				if (!cancelled)
					setError(e instanceof Error ? e.message : "fetch failed");
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [src.urn, dst.urn, view]);

	return (
		<div className="glass-strong pointer-events-auto absolute right-4 top-4 z-10 w-96 max-w-[calc(100vw-2rem)] overflow-hidden">
			<HeaderRow
				label="Connection"
				dotClass="bg-[var(--amethyst)]"
				onClose={onClose}
			/>

			<div className="space-y-4 p-4">
				{src.kind === "track" ? (
					<TrackBlock track={src} />
				) : (
					<NodePreview node={src} />
				)}
				<div className="border-t border-dashed border-white/15" />
				{dst.kind === "track" ? (
					<TrackBlock track={dst} />
				) : (
					<NodePreview node={dst} />
				)}

				<div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs">
					<p className="text-muted-foreground">
						{view === "tracks"
							? "Shared listeners"
							: weight > 1
								? "Liked, weight"
								: "Liked"}
					</p>
					<p className="mt-1 font-mono text-lg text-[var(--amethyst)]">
						{weight.toLocaleString()}
					</p>
				</div>

				{view === "tracks" && (
					<div className="space-y-2">
						<p className="text-xs uppercase tracking-widest text-muted-foreground">
							Top common listeners
						</p>
						{loading && (
							<p className="text-xs text-muted-foreground">Loading…</p>
						)}
						{error && (
							<p className="rounded bg-destructive/10 p-2 text-xs text-destructive">
								{error}
							</p>
						)}
						{detail && detail.common_listeners.length === 0 && !loading && (
							<p className="text-xs text-muted-foreground">
								(no overlapping listeners in this crawl)
							</p>
						)}
						{detail && detail.common_listeners.length > 0 && (
							<ul className="space-y-1.5">
								{detail.common_listeners.map((u) => (
									<li key={u.urn}>
										<a
											href={u.permalink_url ?? "#"}
											target="_blank"
											rel="noreferrer noopener"
											className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-foreground/85 hover:bg-white/5"
										>
											{u.avatar_url && (
												// biome-ignore lint/performance/noImgElement: external SoundCloud avatar
												<img
													src={u.avatar_url}
													alt=""
													className="size-6 rounded-full"
												/>
											)}
											<span className="flex-1 truncate">
												{u.username ?? "(no name)"}
											</span>
											{u.followers_count != null && (
												<span className="font-mono text-muted-foreground">
													{u.followers_count.toLocaleString()}
												</span>
											)}
										</a>
									</li>
								))}
							</ul>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function NodePreview({ node }: { node: GraphNode }) {
	const isTrack = node.kind === "track";
	return (
		<div className="flex items-start gap-3">
			{!isTrack && node.avatar_url && (
				// biome-ignore lint/performance/noImgElement: external SoundCloud avatar
				<img
					src={node.avatar_url}
					alt={node.label ?? ""}
					className="size-10 rounded-full border border-white/10"
				/>
			)}
			{isTrack && (
				<span className="mt-0.5 inline-flex size-10 items-center justify-center rounded-md border border-[var(--jade)]/40 bg-[var(--jade)]/10 text-base">
					♪
				</span>
			)}
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">
					{node.label ?? "(no name)"}
				</p>
				<p className="text-[10px] uppercase tracking-widest text-muted-foreground">
					{isTrack ? "Track" : "User"}
				</p>
				{node.permalink_url && (
					<a
						href={node.permalink_url}
						target="_blank"
						rel="noreferrer noopener"
						className="text-xs text-[var(--jade)] underline-offset-4 hover:underline"
					>
						soundcloud.com ↗
					</a>
				)}
			</div>
		</div>
	);
}

function HeaderRow({
	label,
	dotClass,
	onClose,
}: {
	label: string;
	dotClass: string;
	onClose: () => void;
}) {
	return (
		<div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
			<div className="flex items-center gap-2">
				<span
					className={`size-2 rounded-full ${dotClass} shadow-[0_0_8px_currentColor]`}
				/>
				<span className="text-xs uppercase tracking-widest text-muted-foreground">
					{label}
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
	);
}
