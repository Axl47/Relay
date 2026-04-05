import { redirect } from "next/navigation";
import { buildTitleHref } from "../../../../../lib/routes";

type PageProps = {
  params: Promise<{
    providerId: string;
    externalAnimeId: string;
  }>;
};

export default async function AnimeDetailRedirectPage({ params }: PageProps) {
  const { providerId, externalAnimeId } = await params;
  redirect(buildTitleHref(providerId, externalAnimeId));
}
