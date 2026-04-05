export type PlaywrightRequestLike = {
  url(): string;
  allHeaders(): Promise<Record<string, string>>;
};

export type PlaywrightResponseLike = {
  url(): string;
  status(): number;
  text(): Promise<string>;
  request(): PlaywrightRequestLike;
};

export type PlaywrightLocatorLike = {
  count(): Promise<number>;
  first(): PlaywrightLocatorLike;
  nth(index: number): PlaywrightLocatorLike;
  locator(selector: string): PlaywrightLocatorLike;
  getAttribute(name: string): Promise<string | null>;
  textContent(): Promise<string | null>;
  fill(value: string): Promise<void>;
  press(key: string): Promise<void>;
};

export interface PlaywrightPageLike {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  waitForSelector(selector: string, options?: Record<string, unknown>): Promise<unknown>;
  click(selector: string, options?: Record<string, unknown>): Promise<void>;
  locator(selector: string): PlaywrightLocatorLike;
  evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>;
  evaluate<T, Arg>(pageFunction: (arg: Arg) => T | Promise<T>, arg: Arg): Promise<T>;
  on(event: "request", listener: (request: PlaywrightRequestLike) => void): void;
  on(event: "response", listener: (response: PlaywrightResponseLike) => void): void;
}
