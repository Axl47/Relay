import type { AnimeDetails } from "@relay/contracts";

export type SearchCard = {
  externalAnimeId: string;
  title: string;
  searchTitles: string[];
  synopsis: string | null;
  coverImage: string | null;
  year: number | null;
};

export type AnimeOnsenSearchApiHit = {
  content_title?: string | null;
  content_title_en?: string | null;
  content_title_jp?: string | null;
  content_id?: string | null;
};

export type AnimeOnsenSearchApiResponse = {
  hits?: AnimeOnsenSearchApiHit[];
  estimatedTotalHits?: number | null;
  limit?: number | null;
  offset?: number | null;
};

export type AnimeOnsenEpisodesApiResponse = Record<
  string,
  {
    contentTitle_episode_en?: string | null;
    contentTitle_episode_jp?: string | null;
  }
>;

export type AnimeOnsenPageSnapshot = {
  title: string;
  synopsis: string | null;
  coverImage: string | null;
  year: number | null;
  tags: string[];
  totalEpisodes: number | null;
  contentId: string | null;
};

export type EpisodeEntry = {
  externalEpisodeId: string;
  number: number;
  title: string;
  thumbnail: string | null;
};

export type ResolvedSubtitle = {
  label: string;
  language: string;
  url: string;
  format: "vtt" | "srt" | "ass";
  isDefault: boolean;
};

export type ResolvedStream = {
  url: string;
  mimeType: "application/vnd.apple.mpegurl" | "application/dash+xml" | "video/mp4";
  quality: string;
};
