const DEFAULT_LOCAL_API_BASE = "http://127.0.0.1:8000";
const DEFAULT_LOCAL_WS_BASE = "ws://127.0.0.1:8000";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isProduction() {
  return process.env.NODE_ENV === "production";
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
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    url.startsWith("ws://")
  ) {
    return `wss://${url.slice("ws://".length)}`;
  }

  return url;
}

function getPublicApiEnv() {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    ""
  );
}

function getPublicWsEnv() {
  return (
    process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_WS_URL ?? ""
  );
}

export function getPublicApiBaseUrl() {
  const configured = trimTrailingSlash(getPublicApiEnv());

  if (configured) {
    return configured;
  }

  if (!isProduction()) {
    return DEFAULT_LOCAL_API_BASE;
  }

  return "https://api.nodemelon.xyz";
}

export function getServerApiBaseUrl() {
  const configured = trimTrailingSlash(
    process.env.BOT_API_BASE_URL ?? getPublicApiEnv(),
  );

  if (configured) {
    return configured;
  }

  if (!isProduction()) {
    return DEFAULT_LOCAL_API_BASE;
  }

  return "https://api.nodemelon.xyz";
}

export function getPublicWsBaseUrl() {
  const explicitWs = trimTrailingSlash(getPublicWsEnv());

  if (explicitWs) {
    return ensureSecureWsInBrowser(explicitWs);
  }

  const apiBase = trimTrailingSlash(getPublicApiEnv());

  if (apiBase) {
    return ensureSecureWsInBrowser(toWsBase(apiBase));
  }

  if (!isProduction()) {
    return DEFAULT_LOCAL_WS_BASE;
  }

  return "wss://api.nodemelon.xyz";
}
