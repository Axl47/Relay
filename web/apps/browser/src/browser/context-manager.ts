import { BrowserPool } from "./browser-pool";
import type { CookieJarStore } from "../cookies/cookie-jar";
import type { BrowserContext, BrowserCookie, BrowserPage } from "./playwright-runtime";

type ManagedContext = {
  providerId: string;
  domain: string;
  browserIndex: number;
  context: BrowserContext;
};

const DEFAULT_BROWSER_CONTEXT_OPTIONS = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  viewport: {
    width: 1366,
    height: 768,
  },
  locale: "en-US",
  timezoneId: "America/New_York",
} as const;

function shouldUseEphemeralContext(providerId: string) {
  return providerId === "hentaihaven" || providerId === "animetake";
}

function makeContextKey(providerId: string, domain: string) {
  return `${providerId}:${domain}`;
}

function makeCookieKey(providerId: string, domain: string) {
  return `${providerId}:${domain}`;
}

function stableIndex(providerId: string, domain: string, size: number) {
  const value = `${providerId}:${domain}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash) % size;
}

export class ProviderContextManager {
  private readonly contexts = new Map<string, ManagedContext>();

  constructor(
    private readonly pool: BrowserPool,
    private readonly cookieJar: CookieJarStore,
  ) {}

  private async createContext(providerId: string, domain: string): Promise<ManagedContext> {
    const browserIndex = stableIndex(providerId, domain, this.pool.size);
    const browser = await this.pool.getByIndex(browserIndex);
    const context = await browser.newContext(DEFAULT_BROWSER_CONTEXT_OPTIONS);
    if (!shouldUseEphemeralContext(providerId)) {
      const cookieKey = makeCookieKey(providerId, domain);
      const storedCookies = await this.cookieJar.get(cookieKey);

      if (storedCookies && storedCookies.length > 0) {
        await context.addCookies(storedCookies);
      }
    }

    return {
      providerId,
      domain,
      browserIndex,
      context,
    };
  }

  private async getContext(providerId: string, domain: string): Promise<ManagedContext> {
    const key = makeContextKey(providerId, domain);
    const existing = this.contexts.get(key);
    if (existing) {
      return existing;
    }

    const created = await this.createContext(providerId, domain);
    this.contexts.set(key, created);
    return created;
  }

  private async persistCookies(providerId: string, domain: string, context: BrowserContext) {
    if (shouldUseEphemeralContext(providerId)) {
      return;
    }

    const cookies = await context.cookies();
    await this.cookieJar.set(makeCookieKey(providerId, domain), cookies as BrowserCookie[]);
  }

  async withPage<T>(
    providerId: string,
    domain: string,
    task: (page: BrowserPage, context: BrowserContext) => Promise<T>,
  ): Promise<T> {
    if (shouldUseEphemeralContext(providerId)) {
      const managedContext = await this.createContext(providerId, domain);
      const page = await managedContext.context.newPage();

      try {
        return await task(page, managedContext.context);
      } finally {
        await page.close();
        await managedContext.context.close();
      }
    }

    const managedContext = await this.getContext(providerId, domain);
    const page = await managedContext.context.newPage();

    try {
      return await task(page, managedContext.context);
    } finally {
      await this.persistCookies(providerId, domain, managedContext.context);
      await page.close();
    }
  }

  async resetContext(providerId: string, domain: string) {
    const key = makeContextKey(providerId, domain);
    const managed = this.contexts.get(key);
    if (!managed) {
      return;
    }

    this.contexts.delete(key);
    await this.persistCookies(providerId, domain, managed.context);
    await managed.context.close();
  }

  async close() {
    const contexts = Array.from(this.contexts.values());
    this.contexts.clear();

    await Promise.all(
      contexts.map(async ({ providerId, domain, context }) => {
        await this.persistCookies(providerId, domain, context);
        await context.close();
      }),
    );

    await this.pool.close();
  }
}
