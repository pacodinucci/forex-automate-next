export type BotStatus = "RUNNING" | "STOPPED";

export type Bot = {
  id: string;
  userId: string;
  name: string;
  accountId: string | null;
  instrument: string;
  riskPercent: number;
  trendTimeframe: string;
  signalTimeframe: string;
  status: BotStatus;
  maxOpenTrades: number;
  isDeleted: boolean;
  lastError: string | null;
  createdAt: string; // en la API viene serializado como string ISO
  updatedAt: string;
};
export type BotsResponse = {
  data: Bot[];
};

export type BotDetailResponse = {
  bot: Bot;
  position?: {
    side: "buy" | "sell";
    units: number;
    entryPrice: number;
    sl: number;
    tp: number;
    unrealizedPL: number;
  } | null;
};

export type CreateBotPayload = {
  instrument: string;
  riskPct?: number; // default 2 en back si no viene
  autoStart?: boolean; // opcional si lo querés manejar en front
};

export type CreateBotResponse = {
  bot: Bot; // o directamente Bot si tu API devuelve el bot pelado
};
