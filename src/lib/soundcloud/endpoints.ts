import type { SoundCloudClient } from "./client";
import type {
	PaginatedResponse,
	SoundCloudTrack,
	SoundCloudUser,
} from "./types";

const DEFAULT_PAGE_SIZE = 200;

interface PaginateOptions {
	/** Max items to yield before stopping. Defaults to unlimited. */
	max?: number;
	/** Per-page size. SoundCloud caps at 200. */
	pageSize?: number;
}

/**
 * Async-iterate a paginated SoundCloud collection. Follows `next_href` until
 * it's null or `opts.max` items have been yielded.
 *
 *   for await (const t of paginate<Track>(client, "/me/likes/tracks", { max: 500 })) { ... }
 */
export async function* paginate<T>(
	client: SoundCloudClient,
	path: string,
	opts?: PaginateOptions,
): AsyncGenerator<T> {
	const max = opts?.max ?? Number.POSITIVE_INFINITY;
	const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;

	const separator = path.includes("?") ? "&" : "?";
	let next: string | undefined =
		`${path}${separator}linked_partitioning=true&page_size=${pageSize}`;

	let yielded = 0;
	while (next && yielded < max) {
		const data: PaginatedResponse<T> = await client.json(next);
		for (const item of data.collection) {
			if (yielded >= max) return;
			yield item;
			yielded++;
		}
		next = data.next_href ?? undefined;
	}
}

/** Convenience: collect a paginated stream into an array (up to `opts.max`). */
export async function collect<T>(
	client: SoundCloudClient,
	path: string,
	opts?: PaginateOptions,
): Promise<T[]> {
	const out: T[] = [];
	for await (const item of paginate<T>(client, path, opts)) {
		out.push(item);
	}
	return out;
}

export const me = {
	profile: (client: SoundCloudClient) => client.json<SoundCloudUser>("/me"),

	likes: (client: SoundCloudClient, opts?: PaginateOptions) =>
		paginate<SoundCloudTrack>(client, "/me/likes/tracks", opts),
};

export const tracks = {
	get: (client: SoundCloudClient, urn: string) =>
		client.json<SoundCloudTrack>(`/tracks/${encodeURIComponent(urn)}`),

	favoriters: (client: SoundCloudClient, urn: string, opts?: PaginateOptions) =>
		paginate<SoundCloudUser>(
			client,
			`/tracks/${encodeURIComponent(urn)}/favoriters`,
			opts,
		),

	reposters: (client: SoundCloudClient, urn: string, opts?: PaginateOptions) =>
		paginate<SoundCloudUser>(
			client,
			`/tracks/${encodeURIComponent(urn)}/reposters`,
			opts,
		),
};

export const users = {
	get: (client: SoundCloudClient, urn: string) =>
		client.json<SoundCloudUser>(`/users/${encodeURIComponent(urn)}`),

	likes: (client: SoundCloudClient, urn: string, opts?: PaginateOptions) =>
		paginate<SoundCloudTrack>(
			client,
			`/users/${encodeURIComponent(urn)}/likes/tracks`,
			opts,
		),
};
