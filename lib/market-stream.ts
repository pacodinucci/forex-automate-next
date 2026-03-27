import { getPublicWsBaseUrl } from "@/lib/endpoints";

export type LiveQuote = {
  symbol: string;
  price?: number;
  bid?: number;
  ask?: number;
  mid?: number;
  timestamp?: number;
  direction?: "up" | "down" | "flat";
};

function getMarketWsBaseUrl() {
  return `${getPublicWsBaseUrl()}/ws/prices`;
}

export function getMarketWsUrl(symbols: string[], interval = 1) {
  const params = new URLSearchParams();
  params.set("symbols", symbols.join(","));
  params.set("interval", String(interval));
  return `${getMarketWsBaseUrl()}?${params.toString()}`;
}
