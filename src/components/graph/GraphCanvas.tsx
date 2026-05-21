"use client";

import Graph from "graphology";
import { useEffect, useMemo, useRef, useState } from "react";
import Sigma from "sigma";
import {
	colorForCommunity,
	communityPalette,
	OWNER_NODE_COLOR,
	SELECTION_COLOR,
} from "./community-colors";
import { drawGlassHover } from "./hover-renderer";
import type { GraphNode, GraphPayload, Selected } from "./types";

interface Props {
	data: GraphPayload;
	selected: Selected | null;
	onSelect: (sel: Selected | null) => void;
	hiddenCommunities: Set<number>;
}

// Edges blend into the background: thin, low alpha, no visual stacking.
// Hit detection is handled by our own point-to-segment math (clickStage)
// so the rendered thickness doesn't constrain the click target.
const EDGE_COLOR = "rgba(110, 130, 165, 0.12)";
const EDGE_SIZE = 0.15;

/** Click anywhere within this many CSS pixels of an edge to select it. */
const EDGE_CLICK_RADIUS_PX = 14;

function distancePointToSegment(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(px - ax, py - ay);
	let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
	t = Math.max(0, Math.min(1, t));
	const ix = ax + t * dx;
	const iy = ay + t * dy;
	return Math.hypot(px - ix, py - iy);
}

export function GraphCanvas({
	data,
	selected,
	onSelect,
	hiddenCommunities,
}: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const sigmaRef = useRef<Sigma | null>(null);
	const graphRef = useRef<Graph | null>(null);
	const [error, setError] = useState<string | null>(null);

	const nodeByUrn = useMemo(() => {
		const m = new Map<string, GraphNode>();
		for (const n of data.nodes) m.set(n.urn, n);
		return m;
	}, [data.nodes]);

	const palette = useMemo(() => {
		const max = data.nodes.reduce(
			(acc, n) =>
				n.community != null && n.community > acc ? n.community : acc,
			0,
		);
		return communityPalette(max + 1);
	}, [data.nodes]);

	// Build graphology graph + mount sigma whenever data changes.
	useEffect(() => {
		if (!containerRef.current) return;
		try {
			const graph = new Graph({ type: "undirected", multi: false });
			for (const n of data.nodes) {
				const isOwner = n.urn === data.ownerUrn;
				const baseSize = n.kind === "track" ? 6 : 3;
				const sizeBoost =
					n.kind === "user"
						? Math.min(6, Math.log10((n.followers_count ?? 0) + 1))
						: Math.min(6, Math.log10((n.likes_count ?? 0) + 1));
				graph.addNode(n.urn, {
					x: n.x,
					y: n.y,
					size: baseSize + sizeBoost,
					label:
						n.kind === "track"
							? `♪ ${n.label ?? ""}`
							: (n.label ?? "(no name)"),
					color: isOwner
						? OWNER_NODE_COLOR
						: colorForCommunity(n.community, palette),
					nodeKind: n.kind,
					community: n.community,
					urn: n.urn,
				});
			}
			for (const e of data.edges) {
				if (graph.hasNode(e.src) && graph.hasNode(e.dst)) {
					if (!graph.hasEdge(e.src, e.dst)) {
						graph.addEdge(e.src, e.dst, {
							size: EDGE_SIZE,
							color: EDGE_COLOR,
							weight: e.weight,
						});
					}
				}
			}
			graphRef.current = graph;

			sigmaRef.current?.kill();
			const sigma = new Sigma(graph, containerRef.current, {
				renderEdgeLabels: false,
				defaultNodeColor: "#888",
				defaultEdgeColor: EDGE_COLOR,
				labelColor: { color: "rgba(245, 245, 250, 0.9)" },
				labelSize: 11,
				labelDensity: 0.07,
				labelGridCellSize: 80,
				labelRenderedSizeThreshold: 5,
				minCameraRatio: 0.05,
				maxCameraRatio: 20,
				minEdgeThickness: 0.4,
				// Sigma's built-in edge hit-test is based on rendered thickness and
				// works poorly for our thin edges. We do our own in clickStage.
				enableEdgeEvents: false,
				defaultDrawNodeHover: drawGlassHover,
			});

			sigma.on("clickNode", ({ node }) => {
				const data = nodeByUrn.get(node);
				if (data) onSelect({ kind: "node", node: data });
			});

			// clickStage fires whenever the click missed every node. We use it to
			// look for a nearby edge (within EDGE_CLICK_RADIUS_PX) and select it
			// — or, if nothing nearby, deselect.
			sigma.on("clickStage", ({ event }) => {
				const eX = event.x;
				const eY = event.y;
				if (typeof eX !== "number" || typeof eY !== "number") {
					onSelect(null);
					return;
				}

				const click = sigma.viewportToGraph({ x: eX, y: eY });
				const origin = sigma.viewportToGraph({ x: 0, y: 0 });
				const offset = sigma.viewportToGraph({
					x: EDGE_CLICK_RADIUS_PX,
					y: 0,
				});
				const radiusGraph = Math.abs(offset.x - origin.x);

				let nearest: string | null = null;
				let nearestDist = Number.POSITIVE_INFINITY;
				graph.forEachEdge((edgeKey, _attrs, src, dst) => {
					const sx = graph.getNodeAttribute(src, "x") as number;
					const sy = graph.getNodeAttribute(src, "y") as number;
					const tx = graph.getNodeAttribute(dst, "x") as number;
					const ty = graph.getNodeAttribute(dst, "y") as number;
					const d = distancePointToSegment(click.x, click.y, sx, sy, tx, ty);
					if (d < nearestDist) {
						nearestDist = d;
						nearest = edgeKey;
					}
				});

				if (nearest && nearestDist < radiusGraph) {
					const extr = graph.extremities(nearest);
					const srcNode = nodeByUrn.get(extr[0]);
					const dstNode = nodeByUrn.get(extr[1]);
					const weight =
						(graph.getEdgeAttribute(nearest, "weight") as number) ?? 1;
					if (srcNode && dstNode) {
						onSelect({
							kind: "edge",
							edge: { src: srcNode, dst: dstNode, weight },
						});
						return;
					}
				}

				onSelect(null);
			});

			sigmaRef.current = sigma;
			return () => {
				sigma.kill();
				sigmaRef.current = null;
			};
		} catch (e) {
			setError(e instanceof Error ? e.message : "failed to render graph");
		}
	}, [data, palette, nodeByUrn, onSelect]);

	// Re-color nodes when selection or hidden communities change.
	useEffect(() => {
		const graph = graphRef.current;
		const sigma = sigmaRef.current;
		if (!graph || !sigma) return;

		const selectedNodeUrns = new Set<string>();
		if (selected?.kind === "node") {
			selectedNodeUrns.add(selected.node.urn);
		} else if (selected?.kind === "edge") {
			selectedNodeUrns.add(selected.edge.src.urn);
			selectedNodeUrns.add(selected.edge.dst.urn);
		}

		graph.forEachNode((node, attrs) => {
			const community = attrs.community as number | null;
			const isHidden = community != null && hiddenCommunities.has(community);
			const isOwner = node === data.ownerUrn;
			const isSelected = selectedNodeUrns.has(node);

			let color: string;
			if (isSelected) color = SELECTION_COLOR;
			else if (isOwner) color = OWNER_NODE_COLOR;
			else color = colorForCommunity(community, palette);

			graph.setNodeAttribute(node, "color", color);
			graph.setNodeAttribute(
				node,
				"hidden",
				isHidden && !isSelected && !isOwner,
			);
		});

		// Highlight selected edge: brighter amethyst.
		graph.forEachEdge((edge) => {
			graph.setEdgeAttribute(edge, "color", EDGE_COLOR);
			graph.setEdgeAttribute(edge, "size", EDGE_SIZE);
		});
		if (selected?.kind === "edge") {
			const { src, dst } = selected.edge;
			if (graph.hasEdge(src.urn, dst.urn)) {
				const edgeKey = graph.edge(src.urn, dst.urn);
				if (edgeKey != null) {
					graph.setEdgeAttribute(edgeKey, "color", SELECTION_COLOR);
					graph.setEdgeAttribute(edgeKey, "size", 1.5);
				}
			}
		}

		sigma.refresh();
	}, [selected, hiddenCommunities, palette, data.ownerUrn]);

	if (error) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-destructive">
				{error}
			</div>
		);
	}

	return <div ref={containerRef} className="h-full w-full" />;
}
