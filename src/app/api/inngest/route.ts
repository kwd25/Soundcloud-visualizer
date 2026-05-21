import { serve } from "inngest/next";
import { crawlOwnerLikes, inngest } from "@/lib/inngest";

export const { GET, POST, PUT } = serve({
	client: inngest,
	functions: [crawlOwnerLikes],
});
