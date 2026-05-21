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

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type?: string;
	scope?: string;
}

interface TokenRequestContext {
	params: Record<string, string | undefined>;
	checks: { code_verifier?: string };
	provider: {
		callbackUrl: string;
		clientId?: string;
		clientSecret?: string;
	};
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
		token: {
			url: "https://secure.soundcloud.com/oauth/token",
			async request({ params, checks, provider }: TokenRequestContext) {
				const body = new URLSearchParams({
					grant_type: "authorization_code",
					code: params.code ?? "",
					redirect_uri: provider.callbackUrl,
					client_id: provider.clientId ?? "",
					client_secret: provider.clientSecret ?? "",
				});
				if (checks.code_verifier) {
					body.set("code_verifier", checks.code_verifier);
				}
				const res = await fetch("https://secure.soundcloud.com/oauth/token", {
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Accept: "application/json; charset=utf-8",
					},
					body,
				});
				if (!res.ok) {
					throw new Error(
						`SoundCloud /oauth/token ${res.status}: ${await res.text()}`,
					);
				}
				const tokens = (await res.json()) as TokenResponse;
				return { tokens };
			},
		},
		userinfo: {
			url: "https://api.soundcloud.com/me",
			async request({ tokens }: { tokens: { access_token?: string } }) {
				const res = await fetch("https://api.soundcloud.com/me", {
					headers: {
						Authorization: `OAuth ${tokens.access_token ?? ""}`,
						Accept: "application/json; charset=utf-8",
					},
				});
				if (!res.ok) {
					throw new Error(`SoundCloud /me ${res.status}: ${await res.text()}`);
				}
				return (await res.json()) as SoundCloudProfile;
			},
		},
		client: {
			token_endpoint_auth_method: "client_secret_post",
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
