import { appApi } from "@/lib/app-api";
import type {
  Bot,
  BotLogsResponse,
  BotStatus,
  BotStrategyRuntimeState,
  BulkCreateBotsPayload,
  BulkCreateBotsResponse,
  CreateBotPayload,
  DryRunPayload,
  DryRunResponse,
  MarketConnectionStatusResponse,
  MarketEventsStatusResponse,
  MarketHubStatusResponse,
  MarketHubSymbolResponse,
  MarketMajorSymbolsResponse,
  MarketPriceResponse,
  MarketPricesResponse,
  MarketRuntimeHealthResponse,
  StrategiesResponse,
  UpdateBotPayload,
} from "@/lib/types";

type RawBot = Partial<Bot> & {
  instrument?: string;
  symbol?: string;
  params?: Record<string, unknown>;
  strategyParams?: Record<string, unknown>;
  runtimeActive?: boolean;
  accountId?: string | null;
  name?: string | null;
  status?: BotStatus;
  isDeleted?: boolean;
  strategyRuntimeState?: BotStrategyRuntimeState | null;
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeBot(raw: RawBot): Bot {
  const instrument = raw.instrument ?? raw.symbol ?? "";
  const params = asRecord(raw.params ?? raw.strategyParams);

  return {
    id: raw.id ?? "",
    userId: raw.userId ?? "",
    name: raw.name ?? null,
    accountId: raw.accountId ?? "",
    instrument,
    symbol: raw.symbol ?? instrument,
    strategy: raw.strategy ?? "",
    params,
    strategyParams: params,
    status: raw.status ?? "STOPPED",
    runtimeActive: raw.runtimeActive ?? false,
    strategyRuntimeState: raw.strategyRuntimeState ?? null,
    isDeleted: raw.isDeleted ?? false,
    lastError: raw.lastError ?? null,
    createdAt: raw.createdAt ?? "",
    updatedAt: raw.updatedAt ?? "",
  };
}

export async function getStrategies() {
  return appApi<StrategiesResponse>("/strategies");
}

export async function getBots(userId?: string) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const data = await appApi<RawBot[] | { bots?: RawBot[] }>(`/bots${query}`);
  const bots = Array.isArray(data) ? data : data.bots ?? [];
  return bots.map(normalizeBot);
}

export async function getBot(botId: string) {
  const data = await appApi<RawBot>(`/bots/${botId}`);
  return normalizeBot(data);
}

export async function createBot(payload: CreateBotPayload) {
  return appApi<{ bot_id: string }>("/bots", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createBotsBulk(payload: BulkCreateBotsPayload) {
  return appApi<BulkCreateBotsResponse>("/bots/bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateBot(botId: string, payload: UpdateBotPayload) {
  const data = await appApi<RawBot>(`/bots/${botId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return normalizeBot(data);
}

export async function deleteBot(botId: string) {
  return appApi<void>(`/bots/${botId}`, {
    method: "DELETE",
  });
}

export async function runBotAction(botId: string, action: "start" | "pause" | "stop" | "resume") {
  return appApi(`/bots/${botId}/${action}`, {
    method: "POST",
  });
}

export async function getBotLogs(botId: string, limit = 100) {
  return appApi<BotLogsResponse>(`/bots/${botId}/logs?limit=${limit}`);
}

export async function runBotDryRun(botId: string, payload?: DryRunPayload) {
  return appApi<DryRunResponse>(`/bots/${botId}/dry-run`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function getMajorSymbols() {
  return appApi<MarketMajorSymbolsResponse>("/market/symbols/majors");
}

export async function getMarketPrice(symbol: string) {
  return appApi<MarketPriceResponse>(`/market/price?symbol=${encodeURIComponent(symbol)}`);
}

export async function getMarketPrices(symbols: string[]) {
  return appApi<MarketPricesResponse>(
    `/market/prices?symbols=${encodeURIComponent(symbols.join(","))}`
  );
}

export async function getMarketConnectionStatus() {
  return appApi<MarketConnectionStatusResponse>("/market/connection-status");
}

export async function getMarketHubStatus() {
  return appApi<MarketHubStatusResponse>("/market/hub/status");
}

export async function getMarketHubSymbolStatus(symbol: string) {
  return appApi<MarketHubSymbolResponse>(`/market/hub/symbol/${encodeURIComponent(symbol)}`);
}

export async function getMarketEventsStatus() {
  return appApi<MarketEventsStatusResponse>("/market/events/status");
}

export async function getMarketRuntimeHealth() {
  return appApi<MarketRuntimeHealthResponse>("/market/runtime/health");
}

export async function startActiveBotsStream() {
  return appApi<{ ok?: boolean; detail?: string }>("/market/stream/active-bots/start", {
    method: "POST",
  });
}
