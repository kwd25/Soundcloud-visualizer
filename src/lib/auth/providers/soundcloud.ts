import type { OAuth2Config, OAuthUserConfig } from "next-auth/providers";

export interface SoundCloudProfile {
	urn: string;
	id: number;
	username: string;
	permalink: string;
	permalink_url: string;
	avatar_url: string;
	followers_count?: number;
}

interface UserinfoTokens {
	access_token?: string;
}

export default function SoundCloud(
	options: OAuthUserConfig<SoundCloudProfile>,
): OAuth2Config<SoundCloudProfile> {
	return {
		id: "soundcloud",
		name: "SoundCloud",
		type: "oauth",
		authorization: {
			url: "https://secure.soundcloud.com/authorize",
			params: { response_type: "code" },
		},
		token: "https://secure.soundcloud.com/oauth/token",
		userinfo: {
			url: "https://api.soundcloud.com/me",
			async request({ tokens }: { tokens: UserinfoTokens }) {
				const res = await fetch("https://api.soundcloud.com/me", {
					headers: {
						Authorization: `OAuth ${tokens.access_token ?? ""}`,
						Accept: "application/json; charset=utf-8",
					},
				});
				if (!res.ok) {
					throw new Error(
						`SoundCloud /me returned ${res.status}: ${await res.text()}`,
					);
				}
				return (await res.json()) as SoundCloudProfile;
			},
		},
		checks: ["pkce", "state"],
		profile(p) {
			return {
				id: p.urn,
				name: p.username,
				image: p.avatar_url,
				email: null,
			};
		},
		options,
	};
}
