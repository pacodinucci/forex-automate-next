export type LiveQuote = {
  symbol: string;
  price?: number;
  bid?: number;
  ask?: number;
  mid?: number;
  timestamp?: number;
  direction?: "up" | "down" | "flat";
};

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

function getMarketWsBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_API_WS_URL;
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const httpBase = process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
  return `${toWsBase(httpBase).replace(/\/+$/, "")}/ws/prices`;
}

export function getMarketWsUrl(symbols: string[], interval = 1) {
  const params = new URLSearchParams();
  params.set("symbols", symbols.join(","));
  params.set("interval", String(interval));
  return `${getMarketWsBaseUrl()}?${params.toString()}`;
}
