import { getValidAccessToken } from "./tokens";
import { SoundCloudError } from "./types";

const BASE_URL = "https://api.soundcloud.com";

/** Minimum gap between requests from a single client instance. */
const MIN_REQUEST_GAP_MS = 200;

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

/**
 * Per-user SoundCloud API client. Handles auth, rate limiting (200ms gap),
 * and exponential backoff on 429/5xx.
 *
 * NOT cross-instance: serverless cold starts create a new client, so the
 * 200ms gap is per execution. For multi-step crawls, instantiate ONCE and
 * pass around — the gap then serializes calls within that run.
 */
export class SoundCloudClient {
	private lastRequestAt = 0;

	constructor(private readonly userUrn: string) {}

	/**
	 * Make an authenticated request. `pathOrUrl` may be a path like
	 * "/me/likes/tracks" or a full URL (useful for following `next_href`).
	 */
	async fetch(pathOrUrl: string, init?: RequestInit): Promise<Response> {
		const url = pathOrUrl.startsWith("http")
			? pathOrUrl
			: `${BASE_URL}${pathOrUrl}`;

		let attempt = 0;
		while (true) {
			await this.enforceGap();

			const accessToken = await getValidAccessToken(this.userUrn);
			const headers = new Headers(init?.headers);
			headers.set("Authorization", `OAuth ${accessToken}`);
			if (!headers.has("Accept")) {
				headers.set("Accept", "application/json; charset=utf-8");
			}

			this.lastRequestAt = Date.now();
			const res = await fetch(url, { ...init, headers });

			if (res.ok) return res;

			const retryable = res.status === 429 || res.status >= 500;
			if (!retryable || attempt >= MAX_RETRIES) {
				throw new SoundCloudError(res.status, await res.text());
			}

			const retryAfter = res.headers.get("Retry-After");
			const backoff = retryAfter
				? Math.min(MAX_BACKOFF_MS, Number(retryAfter) * 1000)
				: Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** attempt);
			await sleep(backoff);
			attempt++;
		}
	}

	async json<T>(pathOrUrl: string, init?: RequestInit): Promise<T> {
		const res = await this.fetch(pathOrUrl, init);
		return (await res.json()) as T;
	}

	private async enforceGap() {
		const elapsed = Date.now() - this.lastRequestAt;
		if (elapsed < MIN_REQUEST_GAP_MS) {
			await sleep(MIN_REQUEST_GAP_MS - elapsed);
		}
	}
}

function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
