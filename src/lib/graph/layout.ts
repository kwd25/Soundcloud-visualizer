import type Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

export interface LayoutSettings {
	iterations?: number;
	scalingRatio?: number;
	gravity?: number;
	/**
	 * If true, FA2 treats nodes as having physical extent (via `size` attr)
	 * and prevents them from overlapping. Slower but solves visual stacking.
	 */
	adjustSizes?: boolean;
	/** linLog mode emphasizes cluster separation. Great for dense graphs. */
	linLogMode?: boolean;
}

/**
 * Run ForceAtlas2 with Barnes-Hut optimization. Mutates the graph in place,
 * setting `x` and `y` attributes on every node.
 *
 * Initial positions are seeded in a [-100, 100] random patch — much wider
 * than the [-1, 1] default so FA2 has somewhere to push apart from. For
 * very dense graphs we also pre-write a `size` attribute (derived from
 * degree) and enable adjustSizes so FA2 keeps nodes from overlapping.
 */
export function assignLayout(graph: Graph, opts: LayoutSettings = {}): void {
	const iterations = opts.iterations ?? 300;
	if (graph.order === 0) return;

	// Seed positions over a wider patch so FA2 has room to converge.
	graph.forEachNode((node) => {
		graph.setNodeAttribute(node, "x", Math.random() * 200 - 100);
		graph.setNodeAttribute(node, "y", Math.random() * 200 - 100);
		// If caller wants adjustSizes, FA2 needs a size attribute. Use degree
		// (1 + sqrt(deg)) so high-degree hubs claim more space.
		if (opts.adjustSizes) {
			const deg = graph.degree(node);
			graph.setNodeAttribute(node, "size", 1 + Math.sqrt(deg));
		}
	});

	const inferred = forceAtlas2.inferSettings(graph);
	forceAtlas2.assign(graph, {
		iterations,
		settings: {
			...inferred,
			barnesHutOptimize: graph.order > 1000,
			barnesHutTheta: 0.5,
			scalingRatio: opts.scalingRatio ?? 10,
			strongGravityMode: false,
			gravity: opts.gravity ?? 1,
			slowDown: 1,
			edgeWeightInfluence: 1,
			adjustSizes: opts.adjustSizes ?? false,
			linLogMode: opts.linLogMode ?? false,
			outboundAttractionDistribution: true,
		},
		getEdgeWeight: "weight",
	});

	// Clear the synthetic size attribute so frontend can re-derive from
	// likes_count / followers_count without inheriting the layout size.
	if (opts.adjustSizes) {
		graph.forEachNode((node) => {
			graph.removeNodeAttribute(node, "size");
		});
	}
}
