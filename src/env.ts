import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().url(),
		SOUNDCLOUD_CLIENT_ID: z.string().min(1),
		SOUNDCLOUD_CLIENT_SECRET: z.string().min(1),
		AUTH_SECRET: z.string().min(32),
		INNGEST_EVENT_KEY: z.string().min(1).optional(),
		INNGEST_SIGNING_KEY: z.string().min(1).optional(),
	},
	client: {
		NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
	},
	runtimeEnv: {
		DATABASE_URL: process.env.DATABASE_URL,
		SOUNDCLOUD_CLIENT_ID: process.env.SOUNDCLOUD_CLIENT_ID,
		SOUNDCLOUD_CLIENT_SECRET: process.env.SOUNDCLOUD_CLIENT_SECRET,
		AUTH_SECRET: process.env.AUTH_SECRET,
		INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
		INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
		NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
	},
	emptyStringAsUndefined: true,
});
