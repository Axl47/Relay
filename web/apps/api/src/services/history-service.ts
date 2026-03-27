import type { GroupedHistoryResponse, HistoryEntry } from "@relay/contracts";
import { HistoryRepository } from "../repositories/history-repository";
import { LibraryRepository } from "../repositories/library-repository";
import type { ProviderService } from "./provider-service";

export class HistoryService {
  constructor(
    private readonly historyRepository: HistoryRepository,
    private readonly libraryRepository: LibraryRepository,
    private readonly providers: ProviderService,
  ) {}

  getHistory(userId: string): Promise<HistoryEntry[]> {
    return this.doGetHistory(userId);
  }

  getGroupedHistory(userId: string): Promise<GroupedHistoryResponse> {
    return this.doGetGroupedHistory(userId);
  }

  getUpdates(userId: string) {
    return this.doGetUpdates(userId);
  }

  private createHistoryDayLabel(day: Date, now = new Date()) {
    const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const diffDays = Math.round((current.valueOf() - target.valueOf()) / 86_400_000);

    if (diffDays === 0) {
      return "Today";
    }

    if (diffDays === 1) {
      return "Yesterday";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
    }).format(day);
  }

  private createHistoryTimeLabel(value: Date) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(value);
  }

  private async doGetHistory(userId: string): Promise<HistoryEntry[]> {
    const allowedProviderIds = await this.providers.getAllowedProviderIdsForUser(userId);
    const rows = await this.historyRepository.listHistory(userId, allowedProviderIds);

    return rows.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      libraryItemId: entry.libraryItemId,
      providerId: entry.providerId,
      externalAnimeId: entry.externalAnimeId,
      externalEpisodeId: entry.externalEpisodeId,
      animeTitle: entry.animeTitle,
      episodeTitle: entry.episodeTitle,
      coverImage: entry.coverImage,
      watchedAt: entry.watchedAt.toISOString(),
      positionSeconds: entry.positionSeconds,
      durationSeconds: entry.durationSeconds,
      completed: entry.completed,
    }));
  }

  private async doGetGroupedHistory(userId: string): Promise<GroupedHistoryResponse> {
    const entries = await this.doGetHistory(userId);
    const groups = new Map<string, { key: string; label: string; entries: GroupedHistoryResponse["groups"][number]["entries"] }>();

    for (const entry of entries) {
      const watchedAt = new Date(entry.watchedAt);
      const dayKey = watchedAt.toISOString().slice(0, 10);
      const dayLabel = this.createHistoryDayLabel(watchedAt);
      const timeLabel = this.createHistoryTimeLabel(watchedAt);
      const view = {
        ...entry,
        dayKey,
        dayLabel,
        timeLabel,
      };

      const current = groups.get(dayKey) ?? {
        key: dayKey,
        label: dayLabel,
        entries: [],
      };
      current.entries.push(view);
      groups.set(dayKey, current);
    }

    return {
      groups: Array.from(groups.values()),
    };
  }

  private async doGetUpdates(userId: string) {
    const allowedProviderIds = await this.providers.getAllowedProviderIdsForUser(userId);
    const rows = await this.libraryRepository.listLibraryItems(userId, allowedProviderIds);
    return rows.slice(0, 30);
  }
}
