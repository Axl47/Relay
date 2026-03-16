const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function resolveMediaUrl(url?: string | null) {
  if (!url) {
    return "";
  }

  if (/^(?:data:|blob:)/i.test(url)) {
    return url;
  }

  return `${API_BASE_URL}/media/proxy?url=${encodeURIComponent(url)}`;
}
