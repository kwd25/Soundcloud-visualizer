import { Inngest } from "inngest";

export interface CrawlRequestedEvent {
	name: "crawl/requested";
	data: {
		ownerUrn: string;
		seedCap?: number;
		favoritersCap?: number;
	};
}

export const inngest = new Inngest({
	id: "soundcloud-visualizer",
});
