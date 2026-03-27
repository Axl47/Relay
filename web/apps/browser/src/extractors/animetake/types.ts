export type AnimeTakeListingCard = {
  externalAnimeId: string;
  title: string;
  synopsis: string | null;
  coverImage: string | null;
  latestEpisode: number | null;
};

export type AnimeTakeListingPage = {
  items: AnimeTakeListingCard[];
  hasNextPage: boolean;
};

export type AnimeTakeSearchCard = {
  externalAnimeId: string;
  title: string;
  coverImage: string | null;
  latestEpisode: number | null;
  year: number | null;
};

export type AnimeTakeSearchResultsPage = {
  items: AnimeTakeSearchCard[];
  hasNextPage: boolean;
  noResults: boolean;
};

export type AnimeTakeEpisodeEntry = {
  externalEpisodeId: string;
  number: number;
  title: string;
  thumbnail: string | null;
};

export type AnimeTakeDetailsSnapshot = {
  title: string;
  synopsis: string | null;
  coverImage: string | null;
  year: number | null;
  statusText: string | null;
  tags: string[];
  episodes: AnimeTakeEpisodeEntry[];
  latestEpisode: number | null;
};

export type AnimeTakePlaybackSnapshot = {
  title: string;
  bodyText: string;
  videoSources: string[];
  iframeSources: string[];
  redirectUrls: string[];
  inlineMediaUrls: string[];
  inlineRedirectUrls: string[];
};

export type PlaybackMimeType =
  | "application/vnd.apple.mpegurl"
  | "application/dash+xml"
  | "video/mp4"
  | "text/html";

export type PlaybackCandidate = {
  id: string;
  url: string;
  mimeType: PlaybackMimeType;
  quality: string;
  headers: Record<string, string>;
  proxyMode: "proxy" | "redirect";
  isDefault: boolean;
};

export type AnimeTakeAjaxServer = {
  name: string;
  id: string;
  type: string;
};

export type AnimeTakeAjaxEpisode = {
  externalEpisodeId: string;
  number: number;
  title: string;
  href: string;
};

export type AnimeTakeServerSnapshot = {
  servers: AnimeTakeAjaxServer[];
  episodes: AnimeTakeAjaxEpisode[];
};

export type AnimeTakeEpisodeInfoResponse = {
  grabber?: string;
  params?: unknown;
  backup?: number;
  target?: string;
  type?: string;
  name?: string;
  subtitle?: string;
};
