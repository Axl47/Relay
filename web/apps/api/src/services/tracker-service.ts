import { TrackerRepository } from "../repositories/tracker-repository";

export class TrackerService {
  constructor(private readonly trackers: TrackerRepository) {}

  getTrackerEntries(userId: string) {
    return this.doGetTrackerEntries(userId);
  }

  createTrackerConnection(userId: string, trackerId: "anilist" | "mal") {
    return this.doCreateTrackerConnection(userId, trackerId);
  }

  async deleteTrackerConnection(userId: string, trackerId: string): Promise<void> {
    await this.trackers.deleteAccount(userId, trackerId);
  }

  private async doGetTrackerEntries(userId: string) {
    const accounts = await this.trackers.listAccounts(userId);
    const entries = await this.trackers.listEntries(accounts.map((account) => account.id));
    return {
      accounts,
      entries,
      supported: ["anilist", "mal"],
    };
  }

  private async doCreateTrackerConnection(userId: string, trackerId: "anilist" | "mal") {
    const account = await this.trackers.createAccount(userId, trackerId);
    return {
      ...account,
      note: "OAuth flow is scaffolded but not implemented in this pass.",
    };
  }
}
