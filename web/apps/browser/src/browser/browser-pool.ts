import type { BrowserInstance } from "./playwright-runtime";
import { loadChromium } from "./playwright-runtime";

export class BrowserPool {
  private browsers: BrowserInstance[] = [];
  private initPromise: Promise<void> | null = null;
  private nextIndex = 0;
  private readonly chromium = loadChromium();

  constructor(private readonly poolSize: number) {}

  private async ensureReady() {
    if (this.browsers.length > 0) {
      return;
    }

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      for (let index = 0; index < this.poolSize; index += 1) {
        const browser = await this.chromium.launch({ headless: true });
        this.browsers.push(browser);
      }
    })();

    await this.initPromise;
    this.initPromise = null;
  }

  async acquireRoundRobin(): Promise<{ browser: BrowserInstance; index: number }> {
    await this.ensureReady();
    const index = this.nextIndex % this.browsers.length;
    this.nextIndex += 1;
    return { browser: this.browsers[index], index };
  }

  async getByIndex(index: number): Promise<BrowserInstance> {
    await this.ensureReady();
    return this.browsers[index % this.browsers.length];
  }

  get size() {
    return this.poolSize;
  }

  async close() {
    await Promise.all(this.browsers.map((browser) => browser.close()));
    this.browsers = [];
  }
}
