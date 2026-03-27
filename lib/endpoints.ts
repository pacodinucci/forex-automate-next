const LOCAL_API_BASE = "http://127.0.0.1:8000";
const LOCAL_WS_BASE = "ws://127.0.0.1:8000";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getPublicApiEnv() {
  return process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}

function getPublicWsEnv() {
  return process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_WS_URL ?? "";
}

function toWsBase(url: string) {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return url;
  }

  if (url.startsWith("https://")) {
    return `wss://${url.slice("https://".length)}`;
  }

  if (url.startsWith("http://")) {
    return `ws://${url.slice("http://".length)}`;
  }

  return url;
}

function ensureSecureWsInBrowser(url: string) {
  if (typeof window !== "undefined" && window.location.protocol === "https:" && url.startsWith("ws://")) {
    return `wss://${url.slice("ws://".length)}`;
  }

  return url;
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getPublicApiBaseUrl() {
  const configured = trimTrailingSlash(getPublicApiEnv());
  if (configured) {
    return configured;
  }

  if (!isProduction()) {
    return LOCAL_API_BASE;
  }

  throw new Error(
    "Missing NEXT_PUBLIC_API_URL (or NEXT_PUBLIC_API_BASE_URL) in production."
  );
}

export function getServerApiBaseUrl() {
  const configured = trimTrailingSlash(
    process.env.BOT_API_BASE_URL ?? getPublicApiEnv()
  );
  if (configured) {
    return configured;
  }

  if (!isProduction()) {
    return LOCAL_API_BASE;
  }

  throw new Error(
    "Missing BOT_API_BASE_URL (or NEXT_PUBLIC_API_URL / NEXT_PUBLIC_API_BASE_URL) in production."
  );
}

export function getPublicWsBaseUrl() {
  const explicitWs = trimTrailingSlash(getPublicWsEnv());
  if (explicitWs) {
    return ensureSecureWsInBrowser(explicitWs);
  }

  const apiBase = trimTrailingSlash(getPublicApiEnv());
  if (apiBase) {
    return ensureSecureWsInBrowser(trimTrailingSlash(toWsBase(apiBase)));
  }

  if (!isProduction()) {
    return LOCAL_WS_BASE;
  }

  throw new Error(
    "Missing NEXT_PUBLIC_WS_URL (or NEXT_PUBLIC_API_WS_URL, or NEXT_PUBLIC_API_URL) in production."
  );
}
