import type Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

/**
 * Run ForceAtlas2 with Barnes-Hut optimization. Mutates the graph in place,
 * setting `x` and `y` attributes on every node.
 *
 * Node positions must be initialized before calling — we seed them on a small
 * random patch around the origin. Random init is fine for FA2; it self-organizes
 * within ~500 iterations.
 */
export function assignLayout(graph: Graph, iterations = 500): void {
	if (graph.order === 0) return;

	// Initialize positions (FA2 needs starting x/y on every node).
	graph.forEachNode((node) => {
		graph.setNodeAttribute(node, "x", Math.random() * 2 - 1);
		graph.setNodeAttribute(node, "y", Math.random() * 2 - 1);
	});

	const settings = forceAtlas2.inferSettings(graph);
	forceAtlas2.assign(graph, {
		iterations,
		settings: {
			...settings,
			barnesHutOptimize: graph.order > 1000,
			barnesHutTheta: 0.5,
			scalingRatio: 10,
			strongGravityMode: false,
			gravity: 1,
			slowDown: 1,
			edgeWeightInfluence: 1,
		},
		getEdgeWeight: "weight",
	});
}
