export type BotStatus = "RUNNING" | "PAUSED" | "STOPPED" | "ERROR";

export type StrategyParamType = "int" | "float" | "string" | "boolean";

export type StrategyParamDefinition = {
  key: string;
  type: StrategyParamType;
  required: boolean;
  default?: number | string | boolean | null;
};

export type StrategyDefinition = {
  id: string;
  name: string;
  params: StrategyParamDefinition[];
};

export type StrategiesResponse = {
  count: number;
  strategies: StrategyDefinition[];
};

export type BotRuntimeStage =
  | "WAITING_H4_SETUP"
  | "WAITING_M15_ENTRY"
  | "WAITING_M5_SETUP"
  | "WAITING_M1_ENTRY"
  | "WAITING_H4_LEGS"
  | "WAITING_M5_LEGS"
  | "WAITING_BREAKOUT_OR_ENTRY";

export type BotRuntimeH4Candle = {
  time_utc: string;
  open: number;
  high: number;
  low: number;
  close: number;
  direction: string;
  is_doji: boolean;
};

export type BotRuntimeH4Progress = {
  non_doji_count?: number;
  step?: string;
  candidate_side?: string;
  message?: string;
};

export type BotStrategyRuntimeState = {
  strategy?: string;
  symbol?: string;
  stage?: BotRuntimeStage | string;
  pending_windows_count?: number;
  pending_setups_count?: number;
  h4_count?: number;
  m5_count?: number;
  m15_count?: number;
  m1_count?: number;
  pivot_strength?: number;
  current_setup?: Record<string, unknown> | null;
  h4_last_4?: BotRuntimeH4Candle[];
  m1_last_4?: BotRuntimeH4Candle[];
  m15_last_4?: BotRuntimeH4Candle[];
  h4_progress?: BotRuntimeH4Progress | null;
  m5_last_4?: BotRuntimeH4Candle[];
  m5_progress?: BotRuntimeH4Progress | null;
  [key: string]: unknown;
};

export type Bot = {
  id: string;
  userId: string;
  name: string | null;
  accountId: string;
  instrument: string;
  symbol: string;
  strategy: string;
  params: Record<string, unknown>;
  strategyParams: Record<string, unknown>;
  status: BotStatus;
  runtimeActive: boolean;
  strategyRuntimeState?: BotStrategyRuntimeState | null;
  isDeleted: boolean;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateBotPayload = {
  symbol: string;
  strategy: string;
  accountId: string;
  userId?: string;
  name?: string;
  strategyParams?: Record<string, unknown>;
  volume?: number;
  volumeUnits?: number;
  sl_points?: number;
  tp_points?: number;
};

export type BulkBotCreateItem = {
  symbol: string;
  name?: string;
  volume?: number;
  volumeUnits?: number;
  sl_points?: number;
  tp_points?: number;
  strategyParams?: Record<string, unknown>;
  [key: string]: unknown;
};

export type BulkCreateBotsPayload = {
  strategy: string;
  accountId: string;
  userId?: string;
  namePrefix?: string;
  autoStart?: boolean;
  bots: BulkBotCreateItem[];
};

export type BulkCreateBotResult = {
  index?: number;
  status?: string;
  bot_id?: string;
  symbol?: string;
  strategy?: string;
  started?: boolean;
  detail?: string;
  error?: string;
  [key: string]: unknown;
};

export type BulkCreateBotsResponse = {
  total: number;
  created_count: number;
  started_count: number;
  failed_count: number;
  results: BulkCreateBotResult[];
};

export type UpdateBotPayload = Partial<
  Pick<
    CreateBotPayload,
    "symbol" | "strategy" | "accountId" | "strategyParams" | "name" | "sl_points" | "tp_points" | "volume" | "volumeUnits"
  >
>;

export type BotLog = {
  id: string;
  botId: string;
  timeUtc: string;
  event: string;
  details: Record<string, unknown> | null;
};

export type BotLogsResponse = {
  bot_id: string;
  count: number;
  logs: BotLog[];
};

export type TradeStatus = "OPEN" | "CLOSED";
export type TradeRegistryStatusFilter = "ALL" | TradeStatus;
export type TradeSource = "bot" | "manual" | string;

export type TradeRegistryItem = {
  id: string;
  positionId: string;
  botId: string | null;
  source: TradeSource;
  strategy: string | null;
  symbol: string;
  side: "buy" | "sell" | string;
  volume: number;
  openPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  openedAt: string;
  closedAt: string | null;
  status: TradeStatus;
  closeReason: string | null;
  closePrice: number | null;
  pnl: number | null;
  metadata: Record<string, unknown>;
};

export type TradeRegistryResponse = {
  count: number;
  filters: {
    limit: number;
    status: TradeRegistryStatusFilter;
    symbol?: string | null;
  };
  trades: TradeRegistryItem[];
};

export type DryRunPayload = {
  side: "buy" | "sell";
  entry?: number;
};

export type DryRunResponse = {
  bot_id: string;
  symbol: string;
  strategy: string;
  input: {
    side: "buy" | "sell";
    entry?: number;
  };
  plan: {
    side: "buy" | "sell";
    entry: number;
    sl: number;
    tp: number;
    rr: number;
  };
  used_market_price: boolean;
};

export type MarketPriceResponse = {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  spread?: number;
  time?: string;
};

export type MarketPricesResponse = {
  prices: MarketPriceResponse[];
};

export type MarketMajorSymbolsResponse = {
  count: number;
  symbols: string[];
};

export type MarketConnectionStatusResponse = {
  [key: string]: unknown;
};

export type MarketHubStatusResponse = {
  [key: string]: unknown;
};

export type MarketHubSymbolResponse = {
  [key: string]: unknown;
};

export type MarketEventsStatusResponse = {
  [key: string]: unknown;
};

export type MarketRuntimeHealthResponse = {
  ready?: boolean;
  [key: string]: unknown;
};
