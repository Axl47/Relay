"use client";

import { FALLBACK_COVER } from "../lib/fallback-cover";
import { resolveMediaUrl } from "../lib/media";

type Props = {
  alt: string;
  className: string;
  src?: string | null;
};

export function CoverImage({ alt, className, src }: Props) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} className={className} src={src ? resolveMediaUrl(src) : FALLBACK_COVER} />;
}
