"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { TitleDetailScreen } from "../../../../../components/title-detail-screen";
import { decodeRouteParam } from "../../../../../lib/routes";

export default function TitleDetailPage() {
  const routeParams = useParams<{ providerId: string; externalAnimeId: string }>();
  const resolvedParams = useMemo(
    () => ({
      providerId: decodeRouteParam(routeParams.providerId),
      externalAnimeId: decodeRouteParam(routeParams.externalAnimeId),
    }),
    [routeParams.externalAnimeId, routeParams.providerId],
  );

  return (
    <TitleDetailScreen
      externalAnimeId={resolvedParams.externalAnimeId}
      providerId={resolvedParams.providerId}
    />
  );
}
