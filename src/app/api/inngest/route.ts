import { serve } from "inngest/next";
import { crawlOwnerLikes, inngest, recomputeLayouts } from "@/lib/inngest";

// Inngest invokes this handler once per step.run(). Each invocation must
// finish in one Vercel function lifetime. 60s is the Hobby plan ceiling.
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
	client: inngest,
	functions: [crawlOwnerLikes, recomputeLayouts],
});
