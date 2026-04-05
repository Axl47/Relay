import { cleanText, safeAbsoluteUrl } from "../common/text";

export const BASE_URL = "https://www.animeonsen.xyz";
export const API_BASE_URL = "https://api.animeonsen.xyz";
export const SEARCH_API_URL = "https://search.animeonsen.xyz/indexes/content/search";
export const SEARCH_API_BEARER_TOKEN =
  "0e36d0275d16b40d7cf153634df78bc229320d073f565db2aaf6d027e0c30b13";
export const CONTENT_API_BEARER_TOKEN =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRlZmF1bHQifQ.eyJpc3MiOiJodHRwczovL2F1dGguYW5pbWVvbnNlbi54eXovIiwiYXVkIjoiaHR0cHM6Ly9hcGkuYW5pbWVvbnNlbi54eXoiLCJpYXQiOjE3NzM2ODc1MjcsImV4cCI6MTc3NDI5MjMyNywic3ViIjoiMDZkMjJiOTYtNjNlNy00NmE5LTgwZmMtZGM0NDFkNDFjMDM4LmNsaWVudCIsImF6cCI6IjA2ZDIyYjk2LTYzZTctNDZhOS04MGZjLWRjNDQxZDQxYzAzOCIsImd0eSI6ImNsaWVudF9jcmVkZW50aWFscyJ9.mwRM7tjQb2XK0gqtpl0DZZ77JNVXrsp-N2HA-EurT6JbK74gcIrDrLQMXJ7ipn4uMkJTMq8YZitiAqzyU-MaS-tcZk-xa6fn-qYmhWL-WjimyfV6gLV4797ebCFxDQqdDiBE0TOdDnvDjl0F44j6ZP7fHIUtvYwJE1ADTx-uldMv8sOFGsI5G65s9iTf5T7OOV-0MyKH6c3nzqJMBgVGU0p9HpM9OIPlLUJHTtPNxUol0C3zEyY4c1jg7r_rC4wssM9te7PhbCD9ybE8JULDkPd4HjvJ97NsHA9U6_vqhDGRSKezymxkmOtTZXsS1c7GExCAARBVZF3nlMYZqrGKhA";
export const ANIMEONSEN_CHALLENGE_MARKERS = [
  "just a moment",
  "performing security verification",
  "enable javascript and cookies to continue",
  "verification successful. waiting for",
  "checking your browser before accessing",
];

export function buildAnimeOnsenImageUrl(contentId: string, size = "210x300") {
  return `${API_BASE_URL}/v4/image/${size}/${encodeURIComponent(contentId)}`;
}

export function parseNumber(value?: string | null) {
  const match = cleanText(value).match(/\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseYear(value?: string | null) {
  const match = cleanText(value).match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseEpisodeNumber(value?: string | null) {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return null;
  }

  return parsed >= 0 ? parsed : null;
}

export function uniqueBy<T>(values: T[], keyFn: (value: T) => string) {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(value);
  }

  return output;
}

export { cleanText, safeAbsoluteUrl };
