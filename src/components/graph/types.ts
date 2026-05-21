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
	nodes: GraphNode[];
	edges: GraphEdge[];
}
