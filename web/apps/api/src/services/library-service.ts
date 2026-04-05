import type {
  AssignCategoriesInput,
  Category,
  CreateCategoryInput,
  LibraryDashboardResponse,
  LibraryItemWithCategories,
  UpdateCategoryInput,
  UpdateLibraryItemInput,
  UpsertLibraryItemInput,
} from "@relay/contracts";
import { CatalogRepository } from "../repositories/catalog-repository";
import { LibraryRepository } from "../repositories/library-repository";
import type { ProviderService } from "./provider-service";

export class LibraryService {
  constructor(
    private readonly libraryRepository: LibraryRepository,
    private readonly catalogRepository: CatalogRepository,
    private readonly providers: ProviderService,
  ) {}

  getLibraryDashboard(userId: string): Promise<LibraryDashboardResponse> {
    return this.doGetLibraryDashboard(userId);
  }

  listLibrary(userId: string): Promise<LibraryItemWithCategories[]> {
    return this.doListLibrary(userId);
  }

  addLibraryItem(userId: string, input: UpsertLibraryItemInput) {
    return this.doAddLibraryItem(userId, input);
  }

  updateLibraryItem(userId: string, libraryItemId: string, input: UpdateLibraryItemInput) {
    return this.libraryRepository.updateLibraryItem(userId, libraryItemId, input);
  }

  async deleteLibraryItem(userId: string, libraryItemId: string): Promise<void> {
    await this.libraryRepository.deleteLibraryItem(userId, libraryItemId);
  }

  listCategories(userId: string): Promise<Category[]> {
    return this.doListCategories(userId);
  }

  createCategory(userId: string, input: CreateCategoryInput): Promise<Category> {
    return this.doCreateCategory(userId, input);
  }

  updateCategory(userId: string, categoryId: string, input: UpdateCategoryInput) {
    return this.libraryRepository.updateCategory(userId, categoryId, input);
  }

  assignCategories(
    userId: string,
    libraryItemId: string,
    input: AssignCategoriesInput,
  ): Promise<void> {
    return this.doAssignCategories(userId, libraryItemId, input);
  }

  async getLibraryItemById(userId: string, libraryItemId: string) {
    const items = await this.doListLibrary(userId);
    return items.find((item) => item.id === libraryItemId) ?? null;
  }

  async getLibraryItemByAnime(userId: string, providerId: string, externalAnimeId: string) {
    const items = await this.doListLibrary(userId);
    return items.find((item) => item.providerId === providerId && item.externalAnimeId === externalAnimeId) ?? null;
  }

  private async doGetLibraryDashboard(userId: string): Promise<LibraryDashboardResponse> {
    const [items, categories] = await Promise.all([
      this.doListLibrary(userId),
      this.doListCategories(userId),
    ]);

    if (items.length === 0) {
      return {
        continueWatching: [],
        recentlyAdded: [],
        allItems: [],
        categories,
      };
    }

    const allowedProviderIds = await this.providers.getAllowedProviderIdsForUser(userId);
    const progressRows = await this.libraryRepository.listWatchProgress(userId, allowedProviderIds);
    const progressByLibraryItem = new Map<string, (typeof progressRows)[number]>();
    const progressByAnime = new Map<string, (typeof progressRows)[number]>();

    for (const row of progressRows) {
      if (row.libraryItemId && !progressByLibraryItem.has(row.libraryItemId)) {
        progressByLibraryItem.set(row.libraryItemId, row);
      }

      const animeKey = `${row.providerId}:${row.externalAnimeId}`;
      if (!progressByAnime.has(animeKey)) {
        progressByAnime.set(animeKey, row);
      }
    }

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const progress =
          progressByLibraryItem.get(item.id) ??
          progressByAnime.get(`${item.providerId}:${item.externalAnimeId}`) ??
          null;
        const [animeRow, episodeRow] = await Promise.all([
          this.catalogRepository.findAnime(item.providerId, item.externalAnimeId),
          progress
            ? this.catalogRepository.findEpisode(
                progress.providerId,
                progress.externalAnimeId,
                progress.externalEpisodeId,
              )
            : Promise.resolve(null),
        ]);

        return {
          ...item,
          totalEpisodes: animeRow?.totalEpisodes ?? null,
          progress: progress
            ? {
                positionSeconds: progress.positionSeconds,
                durationSeconds: progress.durationSeconds,
                percentComplete: progress.percentComplete,
                completed: progress.completed,
                updatedAt: progress.updatedAt.toISOString(),
              }
            : null,
          currentEpisodeId: progress?.externalEpisodeId ?? null,
          currentEpisodeNumber: episodeRow?.number ?? item.lastEpisodeNumber ?? null,
          currentEpisodeTitle: episodeRow?.title ?? null,
          isComplete: progress?.completed ?? item.status === "completed",
        };
      }),
    );

    const continueWatching = enrichedItems
      .filter((item) => item.progress && !item.isComplete)
      .sort((left, right) => {
        const leftValue = left.progress ? new Date(left.progress.updatedAt).valueOf() : 0;
        const rightValue = right.progress ? new Date(right.progress.updatedAt).valueOf() : 0;
        return rightValue - leftValue;
      })
      .slice(0, 6);

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentlyAdded = enrichedItems
      .filter((item) => new Date(item.addedAt).valueOf() >= thirtyDaysAgo)
      .sort((left, right) => new Date(right.addedAt).valueOf() - new Date(left.addedAt).valueOf())
      .slice(0, 6);

    const allItems = [...enrichedItems].sort((left, right) => {
      const leftValue = left.lastWatchedAt ? new Date(left.lastWatchedAt).valueOf() : 0;
      const rightValue = right.lastWatchedAt ? new Date(right.lastWatchedAt).valueOf() : 0;
      if (leftValue !== rightValue) {
        return rightValue - leftValue;
      }

      return left.title.localeCompare(right.title);
    });

    return {
      continueWatching,
      recentlyAdded,
      allItems,
      categories,
    };
  }

  private async doListLibrary(userId: string): Promise<LibraryItemWithCategories[]> {
    const allowedProviderIds = await this.providers.getAllowedProviderIdsForUser(userId);
    const items = await this.libraryRepository.listLibraryItems(userId, allowedProviderIds);
    if (items.length === 0) {
      return [];
    }

    const assignments = await this.libraryRepository.listCategoryAssignments(items.map((item) => item.id));
    const categoriesByItem = new Map<string, Array<{ id: string; name: string; position: number }>>();

    for (const assignment of assignments) {
      const current = categoriesByItem.get(assignment.libraryItemId) ?? [];
      current.push({
        id: assignment.categoryId,
        name: assignment.name,
        position: assignment.position,
      });
      categoriesByItem.set(assignment.libraryItemId, current);
    }

    return items.map((item) => ({
      id: item.id,
      userId: item.userId,
      providerId: item.providerId,
      externalAnimeId: item.externalAnimeId,
      title: item.title,
      coverImage: item.coverImage,
      kind: item.kind as LibraryItemWithCategories["kind"],
      status: item.status as LibraryItemWithCategories["status"],
      addedAt: item.addedAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      lastEpisodeNumber: item.lastEpisodeNumber,
      lastWatchedAt: item.lastWatchedAt?.toISOString() ?? null,
      categories: categoriesByItem.get(item.id) ?? [],
    }));
  }

  private async doAddLibraryItem(userId: string, input: UpsertLibraryItemInput) {
    await this.providers.getProviderWithPreferences(userId, input.providerId);
    return this.libraryRepository.createLibraryItem(userId, input);
  }

  private async doListCategories(userId: string): Promise<Category[]> {
    const rows = await this.libraryRepository.listCategories(userId);
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: row.name,
      position: row.position,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private async doCreateCategory(userId: string, input: CreateCategoryInput): Promise<Category> {
    const position = await this.libraryRepository.getNextCategoryPosition(userId);
    const category = await this.libraryRepository.createCategory(userId, input.name, position);
    return {
      id: category.id,
      userId: category.userId,
      name: category.name,
      position: category.position,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  private async doAssignCategories(
    userId: string,
    libraryItemId: string,
    input: AssignCategoriesInput,
  ) {
    await this.libraryRepository.replaceCategoryAssignments(
      userId,
      libraryItemId,
      input.categoryIds,
    );
  }
}
