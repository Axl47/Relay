export type SearchCard = {
  externalAnimeId: string;
  title: string;
  alternativeTitle: string | null;
  coverImage: string | null;
  year: number | null;
};

export type AnimePageEpisodeEntry = {
  externalEpisodeId: string;
  number: number | null;
  title: string;
  thumbnail: string | null;
  releasedText: string | null;
};

export type AnimePageSnapshot = {
  title: string;
  synopsis: string | null;
  coverImage: string | null;
  metaItems: Array<{
    label: string;
    value: string;
  }>;
  tagTexts: string[];
  episodes: AnimePageEpisodeEntry[];
};

export type PlaybackApiSource = {
  src?: string | null;
  type?: string | null;
  label?: string | null;
};

export type PlaybackApiPayload = {
  status?: boolean;
  data?: {
    sources?: PlaybackApiSource[];
  };
};

export type PlaybackPageSnapshot = {
  iframeUrl: string | null;
  title: string;
};

export type PlayerApiRequestParts = {
  a: string;
  b: string;
};

export type StreamMimeType =
  | "application/vnd.apple.mpegurl"
  | "application/dash+xml"
  | "video/mp4"
  | "text/html";

export type ResolvedStreamCandidate = {
  id: string;
  url: string;
  mimeType: StreamMimeType;
  quality: string;
  proxyMode: "proxy" | "redirect";
  isDefault: boolean;
};

export type SubtitleCandidate = {
  url: string;
  format: "vtt" | "srt" | "ass";
  language: string;
  label: string;
  isDefault: boolean;
};
