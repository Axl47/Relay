import { getApiBaseUrl } from "./api-base-url";

export function resolveMediaUrl(url?: string | null) {
  if (!url) {
    return "";
  }

  if (/^(?:data:|blob:)/i.test(url)) {
    return url;
  }

  return `${getApiBaseUrl()}/media/proxy?url=${encodeURIComponent(url)}`;
}
