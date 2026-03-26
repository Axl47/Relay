import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import type { ProviderRequestContext } from "@relay/provider-sdk";
import { WordPressMirrorProviderBase } from "../base/wordpress-mirror-provider-base";
import { getProviderMetadata } from "../provider-definitions";
import {
  DEFAULT_USER_AGENT,
  absoluteUrl,
  cleanText,
  createAnimeDetails,
  createEpisode,
  createPlaybackResolution,
  createSearchResult,
  createStream,
  detectMimeType,
  decodeMaybeBase64,
  extractIdAfterPrefix,
  normalizePathId,
  uniqueBy,
} from "../base/provider-utils";

export class JavGuruProvider extends WordPressMirrorProviderBase {
  private readonly streamPreference = [
    "STREAM DD",
    "STREAM TV",
    "STREAM JK",
    "STREAM ST",
    "STREAM VO",
    "STREAM SB",
  ];

  private decodePathSegment(value: string) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private isUsableImageUrl(value?: string | null) {
    const normalized = cleanText(value);
    return Boolean(normalized) && !normalized.startsWith("data:image/");
  }

  private isLikelySiteLogo(value?: string | null) {
    const normalized = cleanText(value).toLowerCase();
    return (
      normalized.includes("logofinal") ||
      normalized.includes("/logo") ||
      normalized.includes("uu42q1szm-o.png")
    );
  }

  private normalizePosterUrl(value?: string | null) {
    const normalized = cleanText(value);
    if (!normalized) {
      return null;
    }

    return normalized.replace(/-\d+x\d+(?=\.[a-z0-9]+(?:$|\?))/i, "");
  }

  private extractImageUrl(node: any, $: any) {
    const image = $(node).find("img").first();
    const noscriptHtml = cleanText($(node).find("noscript").first().html());
    const noscriptImgSrc = noscriptHtml.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? "";
    const srcset =
      cleanText(image.attr("data-srcset")) ||
      cleanText(image.attr("srcset"));
    const srcsetUrl = srcset
      .split(",")
      .map((entry: string) => cleanText(entry.split(" ").at(0)))
      .find(Boolean);

    return (
      absoluteUrl(
        this.metadata.baseUrl,
        this.normalizePosterUrl(
          cleanText(image.attr("data-lazy-src")) ||
            cleanText(image.attr("data-src")) ||
            cleanText(image.attr("data-original")) ||
            noscriptImgSrc ||
            srcsetUrl ||
            cleanText(image.attr("src")),
        ),
      ) ?? null
    );
  }

  private extractPostCoverImage($: any) {
    const imageCandidates = $("img")
      .toArray()
      .flatMap((node: any) => [
        $(node).attr("data-lazy-src"),
        $(node).attr("data-src"),
        $(node).attr("data-original"),
        $(node).attr("src"),
      ])
      .map((value: string | undefined) =>
        absoluteUrl(this.metadata.baseUrl, this.normalizePosterUrl(value)),
      )
      .filter((value: string | null): value is string => Boolean(value))
      .filter((value: string) => !this.isLikelySiteLogo(value));

    if (imageCandidates[0]) {
      return imageCandidates[0];
    }

    const metaImage = absoluteUrl(
      this.metadata.baseUrl,
      this.normalizePosterUrl(
        this.firstAttr($, ["meta[property='og:image']", ".entry-content img", "img"], "content"),
      ),
    );
    return this.isLikelySiteLogo(metaImage) ? null : metaImage;
  }

  constructor() {
    super(getProviderMetadata("javguru")!);
  }

  async search(input: SearchInput, ctx: ProviderRequestContext): Promise<SearchPage> {
    const $ = await this.fetchSearchDocument(input, ctx);
    const rawItems: Array<ReturnType<typeof createSearchResult>> = uniqueBy(
      $("article, .inside-article")
        .toArray()
        .map((node: any) => {
          const card = $(node);
          const link = card
            .find(".entry-title a[href], h1 a[href], h2 a[href], a[rel='bookmark']")
            .first();
          const href = cleanText(link.attr("href"));
          if (!href) {
            return null;
          }

          const normalizedPath = normalizePathId(this.metadata.baseUrl, href);
          const [postId, slug] = normalizedPath.split("/");
          if (!postId || !slug || !/^\d+$/.test(postId)) {
            return null;
          }

          const externalAnimeId = extractIdAfterPrefix(this.metadata.baseUrl, href, "");
          const title =
            cleanText(link.text()) ||
            cleanText(card.find(".entry-title").first().text()) ||
            cleanText(link.attr("title")) ||
            slug;
          if (!title) {
            return null;
          }

          return createSearchResult({
            providerId: this.metadata.id,
            providerDisplayName: this.metadata.displayName,
            externalAnimeId,
            title,
            synopsis:
              cleanText(
                card.find(".entry-content p, .entry-summary, .excerpt, p").first().text(),
              ) || null,
            coverImage: this.extractImageUrl(card, $),
            year: null,
            kind: "unknown",
            language: "ja",
            contentClass: this.metadata.contentClass,
            requiresAdultGate: this.metadata.requiresAdultGate,
          });
        })
        .filter((item): item is ReturnType<typeof createSearchResult> => item !== null),
      (item) => item.externalAnimeId,
    ).slice(0, input.limit);

    const items = await Promise.all(
      rawItems.map(async (item) => {
        if (this.isUsableImageUrl(item.coverImage)) {
          return item;
        }

        try {
          const post = await this.fetchPostDocument(item.externalAnimeId, ctx);
          const coverImage = this.extractPostCoverImage(post);
          if (!this.isUsableImageUrl(coverImage)) {
            return item;
          }

          return createSearchResult({
            ...item,
            coverImage,
          });
        } catch {
          return item;
        }
      }),
    );

    return {
      providerId: this.metadata.id,
      query: input.query,
      page: input.page,
      hasNextPage: false,
      items,
    };
  }

  private async fetchPostDocument(externalAnimeId: string, ctx: ProviderRequestContext) {
    return this.fetchDocument(
      `${this.metadata.baseUrl}/${this.decodePathSegment(externalAnimeId).replace(/^\/+/, "")}/`,
      ctx,
    );
  }

  async getAnime(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<AnimeDetails> {
    const $ = await this.fetchPostDocument(input.externalAnimeId, ctx);

    return createAnimeDetails({
      providerId: this.metadata.id,
      providerDisplayName: this.metadata.displayName,
      externalAnimeId: input.externalAnimeId,
      title: this.firstText($, ["h1.entry-title", "h1", "title"]),
      synopsis: cleanText($(".entry-content p").first().text()) || null,
      coverImage: this.extractPostCoverImage($),
      bannerImage: null,
      status: "completed",
      year: null,
      tags: uniqueBy(
        $(".tags-links a, .entry-meta a[rel='tag']")
          .toArray()
          .map((node: any) => cleanText($(node).text()))
          .filter(Boolean),
        (value) => value,
      ),
      language: "ja",
      totalEpisodes: 1,
      contentClass: this.metadata.contentClass,
      requiresAdultGate: this.metadata.requiresAdultGate,
    });
  }

  async getEpisodes(
    input: ProviderAnimeRef,
    _ctx: ProviderRequestContext,
  ): Promise<EpisodeList> {
    return {
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      episodes: [
        createEpisode({
          providerId: this.metadata.id,
          externalAnimeId: input.externalAnimeId,
          externalEpisodeId: input.externalAnimeId,
          number: 1,
          title: "Full Video",
          synopsis: null,
          thumbnail: null,
          durationSeconds: null,
          releasedAt: null,
        }),
      ],
    };
  }

  private extractPlaybackUrl(html: string) {
    const iframeDirect = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
    if (iframeDirect && !iframeDirect.includes("creative.mnaspm.com")) {
      return iframeDirect;
    }

    for (const match of html.matchAll(/(?:Base64\.decode|atob)\(["']([^"']+)["']\)/g)) {
      const decoded = decodeMaybeBase64(match[1]);
      const iframeUrl = decoded.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
      if (iframeUrl) {
        return iframeUrl;
      }
      if (/^https?:\/\//i.test(decoded)) {
        return decoded;
      }
    }

    return null;
  }

  private extractStreamButtons(html: string) {
    const labelsByKey = new Map<string, string>();
    for (const match of html.matchAll(
      /<a[^>]+class=["'][^"']*wp-btn-iframe__shortcode[^"']*["'][^>]+data-localize=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi,
    )) {
      labelsByKey.set(match[1], cleanText(match[2]));
    }

    return Array.from(
      html.matchAll(
        /var\s+([A-Za-z0-9_]+)\s*=\s*(\{[\s\S]*?"iframe_url"\s*:\s*"[^"]+"[\s\S]*?\})\s*;/g,
      ),
    )
      .map((match) => {
        try {
          const data = JSON.parse(match[2]) as { iframe_url?: string };
          const searchoUrl = decodeMaybeBase64(data.iframe_url ?? "");
          if (!searchoUrl.startsWith("https://jav.guru/searcho/")) {
            return null;
          }

          return {
            key: match[1],
            label: labelsByKey.get(match[1]) ?? "",
            searchoUrl,
          };
        } catch {
          return null;
        }
      })
      .filter(
        (entry): entry is { key: string; label: string; searchoUrl: string } => entry !== null,
      )
      .sort((left, right) => {
        const leftRank = this.streamPreference.indexOf(left.label);
        const rightRank = this.streamPreference.indexOf(right.label);
        return (leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank) -
          (rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank);
      });
  }

  private async resolveSearchoStream(searchoUrl: string, ctx: ProviderRequestContext) {
    const html = await this.fetchText(searchoUrl, ctx);
    const cid = html.match(/cid:\s*'([^']+)'/)?.[1];
    const base = html.match(/base:\s*'([^']+)'/)?.[1];
    const rtype = html.match(/rtype:\s*'([^']+)'/)?.[1];
    const keysSection = html.match(/keys:\s*\[([^\]]+)\]/)?.[1] ?? "";
    const keys = Array.from(keysSection.matchAll(/'([^']+)'/g)).map((match) => match[1]);
    if (!cid || !base || !rtype || keys.length === 0) {
      return null;
    }

    const attributes = html.match(new RegExp(`<div id=["']${cid}["'][^>]+>`))?.[0] ?? "";
    const fullToken = keys
      .map((key) => attributes.match(new RegExp(`${key}=["']([^"']+)["']`))?.[1] ?? "")
      .join("");
    if (!fullToken) {
      return null;
    }

    const resolved = `${base}?${rtype}r=${fullToken.split("").reverse().join("")}`;
    const response = await ctx.fetch(resolved, {
      signal: ctx.signal,
      redirect: "manual",
      headers: {
        "user-agent": DEFAULT_USER_AGENT,
        "accept-language": "en-US,en;q=0.9",
        referer: searchoUrl,
      },
    });
    const location = response.headers.get("location");
    return location && !location.includes("creative.mnaspm.com") ? location : null;
  }

  private extractDirectStreamUrl(html: string, pageUrl: string) {
    const candidates = [
      ...Array.from(
        html.matchAll(/(?:file|src)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/gi),
      ).map((match) => match[1]),
      ...Array.from(html.matchAll(/https?:\/\/[^"'\\s<>]+\.(?:m3u8|mp4)(?:\?[^"'\\s<>]*)?/gi)).map(
        (match) => match[0],
      ),
    ]
      .map((value) => absoluteUrl(pageUrl, cleanText(value)))
      .filter((value): value is string => Boolean(value));

    return candidates.find((value) => detectMimeType(value) !== "text/html") ?? null;
  }

  private createDoodSuffix(token: string) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return (
      Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(
        "",
      ) +
      `?token=${token}&expiry=${Date.now()}`
    );
  }

  private async resolveDoodStream(playbackUrl: string, ctx: ProviderRequestContext) {
    const pageResponse = await ctx.fetch(playbackUrl, {
      signal: ctx.signal,
      headers: {
        "user-agent": DEFAULT_USER_AGENT,
        "accept-language": "en-US,en;q=0.9",
        referer: this.metadata.baseUrl,
      },
    });
    const html = await pageResponse.text();
    const passMatch = html.match(/\$\.get\('\/pass_md5\/([^']+)\/([^']+)'/);
    if (!passMatch) {
      return null;
    }

    const [, hash, token] = passMatch;
    const baseUrl = cleanText(
      await this.fetchText(`${new URL(`/pass_md5/${hash}/${token}`, playbackUrl).toString()}`, ctx, {
        headers: {
          "user-agent": DEFAULT_USER_AGENT,
          "accept-language": "en-US,en;q=0.9",
          referer: playbackUrl,
        },
      }),
    );
    if (!baseUrl) {
      return null;
    }

    return createStream({
      id: "direct",
      url: `${baseUrl}${this.createDoodSuffix(token)}`,
      quality: "auto",
      mimeType: "video/mp4",
      headers: {
        "user-agent": DEFAULT_USER_AGENT,
        "accept-language": "en-US,en;q=0.9",
        referer: playbackUrl,
        origin: new URL(playbackUrl).origin,
      },
      cookies: {},
      proxyMode: "proxy",
      isDefault: true,
    });
  }

  private async resolveDirectStream(playbackUrl: string, ctx: ProviderRequestContext) {
    if (/^(?:https?:\/\/)?(?:www\.)?(?:vide0|doodstream)\./i.test(playbackUrl)) {
      const doodStream = await this.resolveDoodStream(playbackUrl, ctx);
      if (doodStream) {
        return doodStream;
      }
    }

    const html = await this.fetchText(playbackUrl, ctx, {
      headers: {
        "user-agent": DEFAULT_USER_AGENT,
        "accept-language": "en-US,en;q=0.9",
        referer: this.metadata.baseUrl,
      },
    });
    const directStreamUrl = this.extractDirectStreamUrl(html, playbackUrl);
    if (!directStreamUrl) {
      return null;
    }

    return createStream({
      id: "direct",
      url: directStreamUrl,
      quality: "auto",
      mimeType: detectMimeType(directStreamUrl),
      headers: {
        "user-agent": DEFAULT_USER_AGENT,
        "accept-language": "en-US,en;q=0.9",
        referer: playbackUrl,
        origin: new URL(playbackUrl).origin,
      },
      cookies: {},
      proxyMode: "proxy",
      isDefault: true,
    });
  }

  async resolvePlayback(
    input: ProviderEpisodeRef,
    ctx: ProviderRequestContext,
  ): Promise<PlaybackResolution> {
    const html = await this.fetchText(
      `${this.metadata.baseUrl}/${this.decodePathSegment(input.externalEpisodeId).replace(/^\/+/, "")}/`,
      ctx,
    );
    let stream: ReturnType<typeof createStream> | null = null;
    let playbackUrl: string | null = null;
    for (const entry of this.extractStreamButtons(html)) {
      const nextPlaybackUrl = await this.resolveSearchoStream(entry.searchoUrl, ctx);
      if (nextPlaybackUrl && !playbackUrl) {
        playbackUrl = nextPlaybackUrl;
      }
      if (nextPlaybackUrl) {
        stream = await this.resolveDirectStream(nextPlaybackUrl, ctx);
        if (stream) {
          break;
        }
      }
    }

    playbackUrl = playbackUrl ?? this.extractPlaybackUrl(html);
    if (!stream && !playbackUrl) {
      throw new Error("JavGuru did not expose any iframe playback URL.");
    }
    const fallbackPlaybackUrl = playbackUrl;

    return createPlaybackResolution({
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      externalEpisodeId: input.externalEpisodeId,
      streams: [
        stream ??
          createStream({
          id: "iframe",
          url: fallbackPlaybackUrl!,
          quality: "embed",
          mimeType: "text/html",
          headers: {},
          cookies: {},
          proxyMode: "redirect",
          isDefault: true,
          }),
      ],
      subtitles: [],
      cookies: {},
      expiresAt: this.createResolutionExpiry(ctx),
    });
  }
}
