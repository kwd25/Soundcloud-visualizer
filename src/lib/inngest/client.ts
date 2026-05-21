import { Inngest } from "inngest";

export interface CrawlRequestedEvent {
	name: "crawl/requested";
	data: {
		ownerUrn: string;
		seedCap?: number;
		favoritersCap?: number;
	};
}

export interface LayoutsRequestedEvent {
	name: "layouts/requested";
	data: {
		ownerUrn: string;
	};
}

export const inngest = new Inngest({
	id: "soundcloud-visualizer",
});
