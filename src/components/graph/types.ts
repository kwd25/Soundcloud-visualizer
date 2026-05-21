export interface GraphNode {
	urn: string;
	kind: "track" | "user";
	x: number;
	y: number;
	community: number | null;
	label?: string | null;
	avatar_url?: string | null;
	permalink_url?: string | null;
	followers_count?: number | null;
	likes_count?: number | null;
	uploader_urn?: string | null;
}

export interface GraphEdge {
	src: string;
	dst: string;
	weight: number;
}

export interface GraphPayload {
	ownerUrn: string;
	view: "tracks" | "bipartite";
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface SelectedEdge {
	src: GraphNode;
	dst: GraphNode;
	weight: number;
}

export type Selected =
	| { kind: "node"; node: GraphNode }
	| { kind: "edge"; edge: SelectedEdge };

/** Hide communities whose member count is ≤ this. Configurable later. */
export const MIN_VISIBLE_COMMUNITY_SIZE = 5;
