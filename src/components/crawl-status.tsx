"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface CrawlJob {
	id: string;
	status: "running" | "done" | "failed" | string;
	nodesDiscovered: number;
	edgesDiscovered: number;
	startedAt: string | null;
	finishedAt: string | null;
	error: string | null;
	createdAt: string;
}

interface StatusResponse {
	ok: boolean;
	latest: CrawlJob | null;
}

export function CrawlStatus() {
	const [latest, setLatest] = useState<CrawlJob | null>(null);
	const [starting, setStarting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchStatus = useCallback(async () => {
		try {
			const res = await fetch("/api/crawl/status", { cache: "no-store" });
			const data: StatusResponse = await res.json();
			setLatest(data.latest);
		} catch (e) {
			setError(e instanceof Error ? e.message : "fetch failed");
		}
	}, []);

	useEffect(() => {
		fetchStatus();
		const isRunning = latest?.status === "running";
		const ms = isRunning ? 3000 : 15000;
		const id = setInterval(fetchStatus, ms);
		return () => clearInterval(id);
	}, [latest?.status, fetchStatus]);

	const startCrawl = async () => {
		setStarting(true);
		setError(null);
		try {
			const res = await fetch("/api/crawl/start", { method: "POST" });
			if (!res.ok) {
				const t = await res.text();
				throw new Error(t);
			}
			await fetchStatus();
		} catch (e) {
			setError(e instanceof Error ? e.message : "start failed");
		} finally {
			setStarting(false);
		}
	};

	const running = latest?.status === "running";
	const done = latest?.status === "done";
	const buttonLabel = running
		? "Crawl running…"
		: done
			? "Re-run crawl"
			: starting
				? "Starting…"
				: "Start crawl";

	return (
		<div className="glass-strong space-y-4 p-6 text-left text-sm">
			<div className="flex items-baseline justify-between gap-4">
				<p className="font-medium tracking-wide">Community graph crawl</p>
				<button
					type="button"
					onClick={startCrawl}
					disabled={running || starting}
					className="rounded-md border border-[var(--jade)]/40 bg-[var(--jade)]/10 px-3 py-1.5 text-xs font-medium text-[var(--jade)] transition hover:bg-[var(--jade)]/20 disabled:opacity-50"
				>
					{buttonLabel}
				</button>
			</div>

			{latest ? (
				<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
					<dt>Status</dt>
					<dd className="font-mono text-foreground/80">{latest.status}</dd>
					<dt>Nodes discovered</dt>
					<dd className="font-mono text-foreground/80">
						{latest.nodesDiscovered.toLocaleString()}
					</dd>
					<dt>Edges discovered</dt>
					<dd className="font-mono text-foreground/80">
						{latest.edgesDiscovered.toLocaleString()}
					</dd>
					<dt>Started</dt>
					<dd className="font-mono text-xs text-foreground/80">
						{latest.startedAt
							? new Date(latest.startedAt).toLocaleTimeString()
							: "—"}
					</dd>
					<dt>Finished</dt>
					<dd className="font-mono text-xs text-foreground/80">
						{latest.finishedAt
							? new Date(latest.finishedAt).toLocaleTimeString()
							: "—"}
					</dd>
				</dl>
			) : (
				<p className="text-muted-foreground">
					No crawl yet. Click <em>Start crawl</em> to build your graph.
				</p>
			)}

			{latest?.error && (
				<p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
					{latest.error}
				</p>
			)}
			{error && (
				<p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
					{error}
				</p>
			)}

			{done && (
				<Link
					href="/graph"
					className="block w-full rounded-md border border-[var(--amethyst)]/40 bg-[var(--amethyst)]/10 px-4 py-2.5 text-center text-sm font-medium text-[var(--amethyst)] transition hover:bg-[var(--amethyst)]/20"
				>
					View your graph →
				</Link>
			)}
		</div>
	);
}
