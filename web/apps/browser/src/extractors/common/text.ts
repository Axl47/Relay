export function cleanText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function normalizeSearchValue(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function compactSearchValue(value: string) {
  return normalizeSearchValue(value).replace(/\s+/g, "");
}

export function safeAbsoluteUrl(value?: string | null, baseUrl?: string) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return null;
  }
}
