import type { PlaywrightPageLike } from "../common/playwright-types";
import { PLAYER_API_URL, safeAbsoluteUrl } from "./shared";
import type { PlaybackApiPayload, PlayerApiRequestParts } from "./types";

export function parsePlayerApiRequestParts(iframeUrl: string | null): PlayerApiRequestParts | null {
  const absoluteUrl = safeAbsoluteUrl(iframeUrl);
  if (!absoluteUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(absoluteUrl);
    const data = parsedUrl.searchParams.get("data");
    if (!data) {
      return null;
    }

    const decoded = Buffer.from(data, "base64").toString("utf8");
    const separator = ":|::|:";
    const separatorIndex = decoded.indexOf(separator);
    if (separatorIndex < 0) {
      return null;
    }

    const a = decoded.slice(0, separatorIndex);
    const bRaw = decoded.slice(separatorIndex + separator.length);
    if (!a || !bRaw) {
      return null;
    }

    return {
      a,
      b: Buffer.from(bRaw, "utf8").toString("base64"),
    };
  } catch {
    return null;
  }
}

export async function requestPlayerApiPayload(
  page: PlaywrightPageLike,
  iframeUrl: string | null,
): Promise<PlaybackApiPayload | null> {
  const requestParts = parsePlayerApiRequestParts(iframeUrl);
  if (!requestParts) {
    return null;
  }

  const result = await page.evaluate(
    async ({ playerApiUrl, a, b }) => {
      const formData = new FormData();
      formData.set("action", "zarat_get_data_player_ajax");
      formData.set("a", a);
      formData.set("b", b);

      const response = await fetch(playerApiUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      return {
        status: response.status,
        body: await response.text(),
      };
    },
    {
      playerApiUrl: PLAYER_API_URL,
      a: requestParts.a,
      b: requestParts.b,
    },
  );

  if (result.status !== 200) {
    return null;
  }

  try {
    return JSON.parse(result.body) as PlaybackApiPayload;
  } catch {
    return null;
  }
}
