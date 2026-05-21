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

// Edges blend into the background but we keep size larger than strictly
// needed for visuals so sigma's hit-test gives the click a fair target.
// Alpha is dropped proportionally so dense regions don't saturate.
const EDGE_COLOR = "rgba(110, 130, 165, 0.06)";
const EDGE_SIZE = 1.2;

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
				minEdgeThickness: 0.5,
				enableEdgeEvents: true,
				defaultDrawNodeHover: drawGlassHover,
			});

			sigma.on("clickNode", ({ node }) => {
				const data = nodeByUrn.get(node);
				if (data) onSelect({ kind: "node", node: data });
			});
			sigma.on("clickEdge", ({ edge }) => {
				const extr = graph.extremities(edge);
				const src = nodeByUrn.get(extr[0]);
				const dst = nodeByUrn.get(extr[1]);
				const weight = (graph.getEdgeAttribute(edge, "weight") as number) ?? 1;
				if (src && dst) {
					onSelect({ kind: "edge", edge: { src, dst, weight } });
				}
			});
			sigma.on("clickStage", () => onSelect(null));

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
