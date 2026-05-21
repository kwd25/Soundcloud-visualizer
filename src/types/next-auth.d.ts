import type { DefaultSession } from "next-auth";

declare module "next-auth" {
	interface Session {
		user: {
			urn: string;
		} & DefaultSession["user"];
	}
}

declare module "@auth/core/types" {
	interface Session {
		user: {
			urn: string;
		} & DefaultSession["user"];
	}
}

declare module "next-auth/jwt" {
	interface JWT {
		urn?: string;
	}
}

declare module "@auth/core/jwt" {
	interface JWT {
		urn?: string;
	}
}
