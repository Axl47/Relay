import type { AnimeDetails } from "@relay/contracts";

export type AnimePaheSearchResponse = {
  current_page: number;
  last_page: number;
  data?: AnimePaheSearchEntry[];
};

export type AnimePaheSearchEntry = {
  title?: string | null;
  type?: string | null;
  year?: number | null;
  poster?: string | null;
  session?: string | null;
};

export type AnimePaheEpisodeResponse = {
  current_page: number;
  last_page: number;
  data?: AnimePaheEpisodeEntry[];
};

export type AnimePaheEpisodeEntry = {
  episode?: number | null;
  episode2?: number | null;
  edition?: string | null;
  title?: string | null;
  snapshot?: string | null;
  duration?: string | null;
  session?: string | null;
  created_at?: string | null;
};

export type AnimePaheDetailsPayload = {
  title: string;
  synopsis: string | null;
  coverImage: string | null;
  totalEpisodes: number | null;
  year: number | null;
  status: AnimeDetails["status"];
  tags: string[];
};

export type AnimePahePlaybackCandidate = {
  embedUrl: string;
  quality: string;
  isDefault: boolean;
};

export type ManifestCapture = {
  url: string;
  headers: Record<string, string>;
};
