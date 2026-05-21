export interface SoundCloudUser {
	urn: string;
	id: number;
	username: string;
	permalink?: string;
	permalink_url: string;
	avatar_url: string;
	followers_count?: number;
	followings_count?: number;
	description?: string | null;
	city?: string | null;
	country_code?: string | null;
}

export interface SoundCloudTrack {
	urn: string;
	id: number;
	title: string;
	description?: string | null;
	permalink?: string;
	permalink_url: string;
	artwork_url?: string | null;
	duration: number;
	genre?: string | null;
	tag_list?: string;
	playback_count?: number;
	likes_count?: number;
	reposts_count?: number;
	comment_count?: number;
	user: SoundCloudUser;
	created_at: string;
}

export interface PaginatedResponse<T> {
	collection: T[];
	next_href?: string | null;
}

export class SoundCloudError extends Error {
	constructor(
		public status: number,
		public body: string,
	) {
		super(`SoundCloud ${status}: ${body.slice(0, 200)}`);
		this.name = "SoundCloudError";
	}
}

export class RefreshTokenError extends Error {
	constructor(
		public status: number,
		public body: string,
	) {
		super(`SoundCloud refresh ${status}: ${body.slice(0, 200)}`);
		this.name = "RefreshTokenError";
	}
}
