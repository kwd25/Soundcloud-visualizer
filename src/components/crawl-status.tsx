"use client";

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
	const buttonLabel = running
		? "Crawl running…"
		: latest?.status === "done"
			? "Re-run crawl"
			: starting
				? "Starting…"
				: "Start crawl";

	return (
		<div className="rounded-md border bg-muted/30 p-6 text-left text-sm space-y-3">
			<div className="flex items-baseline justify-between gap-4">
				<p className="font-medium">Community graph crawl</p>
				<button
					type="button"
					onClick={startCrawl}
					disabled={running || starting}
					className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
				>
					{buttonLabel}
				</button>
			</div>

			{latest ? (
				<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
					<dt>Status</dt>
					<dd className="font-mono">{latest.status}</dd>
					<dt>Nodes discovered</dt>
					<dd className="font-mono">{latest.nodesDiscovered}</dd>
					<dt>Edges discovered</dt>
					<dd className="font-mono">{latest.edgesDiscovered}</dd>
					<dt>Started</dt>
					<dd className="font-mono text-xs">
						{latest.startedAt
							? new Date(latest.startedAt).toLocaleTimeString()
							: "—"}
					</dd>
					<dt>Finished</dt>
					<dd className="font-mono text-xs">
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
				<p className="rounded bg-destructive/10 p-2 text-xs text-destructive">
					{latest.error}
				</p>
			)}
			{error && (
				<p className="rounded bg-destructive/10 p-2 text-xs text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}
