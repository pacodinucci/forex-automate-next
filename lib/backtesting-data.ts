import { promises as fs } from "node:fs";
import path from "node:path";

export type BacktestStrategyKey =
  | "peak"
  | "break_retest"
  | "leg_continuation_h4_m15"
  | "fib";

export type BacktestDatasetMeta = {
  symbols: string[];
  timeframesBySymbol: Record<string, string[]>;
  strategiesBySymbol: Record<string, BacktestStrategyKey[]>;
};

export type BacktestCandle = {
  time_utc: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type BacktestTrade = {
  id: string;
  symbol: string;
  side: "buy" | "sell" | "unknown";
  setup_time?: string;
  entry_time?: string;
  entry?: number;
  exit_time?: string;
  exit?: number;
  result?: string;
  pnl_points?: number;
};

const DATA_DIR = path.join(process.cwd(), "data");

const STRATEGY_FILE_SEGMENTS: Record<BacktestStrategyKey, string> = {
  peak: "trades_peak",
  break_retest: "trades_break_retest",
  leg_continuation_h4_m15: "trades_leg_continuation",
  fib: "trades_fib",
};

function parseCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  out.push(current.trim());
  return out;
}

function parseCsv(text: string) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length === 0) {
    return { headers: [] as string[], records: [] as Record<string, string>[] };
  }

  const headers = parseCsvLine(rows[0]);
  const records: Record<string, string>[] = [];

  for (const row of rows.slice(1)) {
    const values = parseCsvLine(row);
    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      record[headers[i]] = values[i] ?? "";
    }
    records.push(record);
  }

  return { headers, records };
}

function normalizeTimestamp(value: string | undefined, endOfDay = false) {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const normalizedRaw = dateOnly
    ? `${raw}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`
    : raw.includes("T")
      ? raw
      : raw.replace(" ", "T");
  const asIsoLike = normalizedRaw;
  const ms = Date.parse(asIsoLike);
  if (Number.isNaN(ms)) {
    return undefined;
  }

  return new Date(ms).toISOString();
}

function parseNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function inDateRange(iso: string | undefined, startIso?: string, endIso?: string) {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;

  if (startIso) {
    const startTs = Date.parse(startIso);
    if (!Number.isNaN(startTs) && ts < startTs) return false;
  }

  if (endIso) {
    const endTs = Date.parse(endIso);
    if (!Number.isNaN(endTs) && ts > endTs) return false;
  }

  return true;
}

export async function listBacktestDatasets(): Promise<BacktestDatasetMeta> {
  const dirEntries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  const files = dirEntries.filter((entry) => entry.isFile()).map((entry) => entry.name);

  const timeframesBySymbol = new Map<string, Set<string>>();
  const strategiesBySymbol = new Map<string, Set<BacktestStrategyKey>>();

  for (const name of files) {
    const candleMatch = /^([A-Z]{6})_([A-Za-z0-9]+)\.csv$/i.exec(name);
    if (candleMatch && !name.includes("_trades_")) {
      const symbol = candleMatch[1].toUpperCase();
      const timeframe = candleMatch[2].toUpperCase();

      if (!timeframesBySymbol.has(symbol)) {
        timeframesBySymbol.set(symbol, new Set<string>());
      }
      timeframesBySymbol.get(symbol)?.add(timeframe);
      continue;
    }

    const tradeMatch = /^([A-Z]{6})_trades_([a-z_]+).*\.csv$/i.exec(name);
    if (!tradeMatch) continue;

    const symbol = tradeMatch[1].toUpperCase();
    const segment = tradeMatch[2].toLowerCase();

    const strategy = (Object.entries(STRATEGY_FILE_SEGMENTS).find(([, fileSegment]) => segment.startsWith(fileSegment.replace("trades_", "")))?.[0] ??
      Object.entries(STRATEGY_FILE_SEGMENTS).find(([, fileSegment]) => name.toLowerCase().includes(fileSegment))?.[0]) as
      | BacktestStrategyKey
      | undefined;

    if (!strategy) continue;

    if (!strategiesBySymbol.has(symbol)) {
      strategiesBySymbol.set(symbol, new Set<BacktestStrategyKey>());
    }
    strategiesBySymbol.get(symbol)?.add(strategy);
    if (strategy === "leg_continuation_h4_m15") {
      strategiesBySymbol.get(symbol)?.add("leg_continuation_h4_m15");
    }
  }

  const symbols = [...new Set([...timeframesBySymbol.keys(), ...strategiesBySymbol.keys()])].sort();

  const tfObj: Record<string, string[]> = {};
  const stObj: Record<string, BacktestStrategyKey[]> = {};

  for (const symbol of symbols) {
    const symbolTfs = [...(timeframesBySymbol.get(symbol) ?? new Set<string>())].sort((a, b) => a.localeCompare(b));
    tfObj[symbol] = symbolTfs;
    const strategySet = new Set<BacktestStrategyKey>(strategiesBySymbol.get(symbol) ?? new Set<BacktestStrategyKey>());
    const hasH4 = symbolTfs.includes("H4");
    const hasM15 = symbolTfs.includes("M15");
    if (hasH4 && hasM15) {
      strategySet.add("leg_continuation_h4_m15");
    }
    stObj[symbol] = [...strategySet].sort((a, b) => a.localeCompare(b));
  }

  return {
    symbols,
    timeframesBySymbol: tfObj,
    strategiesBySymbol: stObj,
  };
}

async function readCsvRecords(filePath: string) {
  const text = await fs.readFile(filePath, "utf8");
  return parseCsv(text).records;
}

export async function loadBacktestCandles(params: {
  symbol: string;
  timeframe: string;
  start?: string;
  end?: string;
}) {
  const symbol = params.symbol.trim().toUpperCase();
  const timeframe = params.timeframe.trim().toUpperCase();
  const startIso = normalizeTimestamp(params.start);
  const endIso = normalizeTimestamp(params.end, true);

  const candleFile = path.join(DATA_DIR, `${symbol}_${timeframe}.csv`);
  const candleRows = await readCsvRecords(candleFile);

  const candles: BacktestCandle[] = candleRows
    .map((row) => {
      const time = normalizeTimestamp(row.time_utc ?? row.time);
      const open = parseNumber(row.open);
      const high = parseNumber(row.high);
      const low = parseNumber(row.low);
      const close = parseNumber(row.close);
      const volume = parseNumber(row.volume) ?? 0;

      if (!time || open === undefined || high === undefined || low === undefined || close === undefined) {
        return null;
      }

      return {
        time_utc: time,
        open,
        high,
        low,
        close,
        volume,
      };
    })
    .filter((item): item is BacktestCandle => Boolean(item))
    .filter((candle) => inDateRange(candle.time_utc, startIso, endIso));

  return candles;
}

function findTradeFileName(files: string[], symbol: string, strategy: BacktestStrategyKey) {
  const segment = STRATEGY_FILE_SEGMENTS[strategy];
  const wantedPrefix = `${symbol.toUpperCase()}_${segment}`.toLowerCase();

  const exactAll = files.find((name) => name.toLowerCase() === `${wantedPrefix}_all.csv`);
  if (exactAll) return exactAll;

  const exact = files.find((name) => name.toLowerCase() === `${wantedPrefix}.csv`);
  if (exact) return exact;

  return files.find((name) => name.toLowerCase().startsWith(wantedPrefix));
}

export async function loadBacktestRun(params: {
  symbol: string;
  timeframe: string;
  strategy: BacktestStrategyKey;
  start?: string;
  end?: string;
}) {
  const symbol = params.symbol.trim().toUpperCase();
  const timeframe = params.timeframe.trim().toUpperCase();
  const strategy = params.strategy;

  const startIso = normalizeTimestamp(params.start);
  const endIso = normalizeTimestamp(params.end, true);
  const candles = await loadBacktestCandles({
    symbol,
    timeframe,
    start: params.start,
    end: params.end,
  });

  const dataFiles = await fs.readdir(DATA_DIR);
  const tradeFileName = findTradeFileName(dataFiles, symbol, strategy);
  if (!tradeFileName) {
    throw new Error(`No trades dataset found for ${symbol} with strategy ${strategy}`);
  }

  let trades: BacktestTrade[] = [];
  if (tradeFileName) {
    const tradeRows = await readCsvRecords(path.join(DATA_DIR, tradeFileName));
    trades = tradeRows
      .map((row, index) => {
        const setupTime = normalizeTimestamp(row.setup_time);
        const entryTime = normalizeTimestamp(row.entry_time);
        const exitTime = normalizeTimestamp(row.exit_time);
        const entry = parseNumber(row.entry);
        const exit = parseNumber(row.exit);
        const pnlPoints = parseNumber(row.pnl_points);
        const result = row.result?.trim();
        const symbolFromRow = (row.symbol || symbol).toUpperCase();

        const mainTime = entryTime ?? setupTime ?? exitTime;
        if (!mainTime) return null;
        if (!inDateRange(mainTime, startIso, endIso)) return null;

        const sideRaw = (row.side ?? "").toLowerCase();
        const side: BacktestTrade["side"] = sideRaw === "buy" || sideRaw === "sell" ? sideRaw : "unknown";

        const trade: BacktestTrade = {
          id: `${tradeFileName}:${index}`,
          symbol: symbolFromRow,
          side,
        };

        if (setupTime !== undefined) trade.setup_time = setupTime;
        if (entryTime !== undefined) trade.entry_time = entryTime;
        if (entry !== undefined) trade.entry = entry;
        if (exitTime !== undefined) trade.exit_time = exitTime;
        if (exit !== undefined) trade.exit = exit;
        if (result) trade.result = result;
        if (pnlPoints !== undefined) trade.pnl_points = pnlPoints;

        return trade;
      })
      .filter((item): item is BacktestTrade => Boolean(item));
  }

  const totalTrades = trades.length;
  const winningTrades = trades.filter((trade) => (trade.pnl_points ?? 0) > 0).length;
  const totalPnlPoints = trades.reduce((acc, trade) => acc + (trade.pnl_points ?? 0), 0);

  return {
    symbol,
    timeframe,
    strategy,
    range: {
      start: startIso,
      end: endIso,
    },
    candles,
    trades,
    summary: {
      totalTrades,
      winningTrades,
      winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
      totalPnlPoints,
    },
  };
}
