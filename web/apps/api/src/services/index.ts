import { AuthService } from "./auth-service";
import { CatalogService } from "./catalog-service";
import { HistoryService } from "./history-service";
import { ImportService } from "./import-service";
import { LibraryService } from "./library-service";
import { PlaybackService } from "./playback-service";
import { ProviderService } from "./provider-service";
import { TrackerService } from "./tracker-service";
import { CatalogRepository } from "../repositories/catalog-repository";
import { HistoryRepository } from "../repositories/history-repository";
import { ImportRepository } from "../repositories/import-repository";
import { LibraryRepository } from "../repositories/library-repository";
import { PlaybackRepository } from "../repositories/playback-repository";
import { ProviderRepository } from "../repositories/provider-repository";
import { TrackerRepository } from "../repositories/tracker-repository";
import { UserRepository } from "../repositories/user-repository";
import { ProviderRuntime } from "./provider-runtime";

export type ApiServiceContainer = {
  auth: Pick<
    AuthService,
    "bootstrap" | "login" | "logout" | "getSessionUser" | "getPreferences" | "updatePreferences"
  >;
  providers: Pick<
    ProviderService,
    "ensureProvidersSeeded" | "listProviders" | "updateProviderConfig" | "recordProviderHealth"
  >;
  catalog: Pick<
    CatalogService,
    | "search"
    | "searchWithProgress"
    | "getLastCatalogSearch"
    | "getAnime"
    | "getEpisodes"
    | "getAnimeDetailView"
  >;
  library: Pick<
    LibraryService,
    | "getLibraryDashboard"
    | "listLibrary"
    | "addLibraryItem"
    | "updateLibraryItem"
    | "deleteLibraryItem"
    | "listCategories"
    | "createCategory"
    | "updateCategory"
    | "assignCategories"
  >;
  playback: Pick<
    PlaybackService,
    | "createPlaybackSession"
    | "getPlaybackSession"
    | "getPlaybackSessionBySessionId"
    | "getPlaybackStreamTarget"
    | "getPlaybackStreamTargetBySessionId"
    | "getPlaybackSubtitleTrack"
    | "getPlaybackSubtitleTrackBySessionId"
    | "updatePlaybackProgress"
    | "getWatchContext"
  >;
  history: Pick<HistoryService, "getHistory" | "getGroupedHistory" | "getUpdates">;
  trackers: Pick<
    TrackerService,
    "getTrackerEntries" | "createTrackerConnection" | "deleteTrackerConnection"
  >;
  imports: Pick<ImportService, "createImportJob" | "getImportJob">;
};

export function buildApiServiceContainer(): ApiServiceContainer {
  const userRepository = new UserRepository();
  const providerRepository = new ProviderRepository();
  const catalogRepository = new CatalogRepository();
  const libraryRepository = new LibraryRepository();
  const playbackRepository = new PlaybackRepository();
  const historyRepository = new HistoryRepository();
  const trackerRepository = new TrackerRepository();
  const importRepository = new ImportRepository();
  const runtime = new ProviderRuntime();

  const providers = new ProviderService(providerRepository, userRepository, runtime);
  const library = new LibraryService(libraryRepository, catalogRepository, providers);
  const auth = new AuthService(userRepository, providers);
  const catalog = new CatalogService(
    catalogRepository,
    libraryRepository,
    library,
    providers,
    runtime,
  );
  const playback = new PlaybackService(
    playbackRepository,
    catalogRepository,
    libraryRepository,
    historyRepository,
    providers,
    catalog,
    library,
    runtime,
  );
  const history = new HistoryService(historyRepository, libraryRepository, providers);
  const trackers = new TrackerService(trackerRepository);
  const imports = new ImportService(importRepository);
  return {
    auth,
    providers,
    catalog,
    library,
    playback,
    history,
    trackers,
    imports,
  };
}

export type { SessionUser } from "./auth-service";
