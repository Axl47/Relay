import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type BrowserCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
};

export interface BrowserPage {
  close(options?: { runBeforeUnload?: boolean }): Promise<void>;
}

export interface BrowserContext {
  newPage(): Promise<BrowserPage>;
  addCookies(cookies: BrowserCookie[]): Promise<void>;
  cookies(urls?: string | string[]): Promise<BrowserCookie[]>;
  close(): Promise<void>;
}

export interface BrowserInstance {
  newContext(options?: Record<string, unknown>): Promise<BrowserContext>;
  close(): Promise<void>;
}

type ChromiumLauncher = {
  launch(options?: Record<string, unknown>): Promise<BrowserInstance>;
};

export function loadChromium(): ChromiumLauncher {
  const playwright = require("playwright") as { chromium: ChromiumLauncher };
  return playwright.chromium;
}
