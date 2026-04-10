"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getMarketWsUrl } from "@/lib/market-stream";

export type RuntimeChartCandle = {
  time_utc: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type RuntimeChartDataMode = "live" | "historical";

type UseRuntimeChartDataOptions = {
  symbol: string;
  timeframeLabel: string;
  normalizedFallback: RuntimeChartCandle[];
  fallbackSignature: string;
  defaultVisibleBars: number;
  historyTargetBars?: number;
  dataMode?: RuntimeChartDataMode;
  useWebSocket?: boolean;
  livePrice?: number;
  liveTimestamp?: number;
};

function normalizeSymbolKey(value: string | undefined | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function timeframeAliases(timeframeLabel: string) {
  const tf = timeframeLabel.trim().toUpperCase();
  if (tf === "M1") return ["M1", "m1", "1m", "MINUTE_1"];
  if (tf === "M5") return ["M5", "m5", "5m", "MINUTE_5"];
  if (tf === "M15") return ["M15", "m15", "15m", "MINUTE_15"];
  if (tf === "M30") return ["M30", "m30", "30m", "MINUTE_30"];
  if (tf === "H1") return ["H1", "h1", "1h", "HOUR_1"];
  if (tf === "H4") return ["H4", "h4", "4h", "HOUR_4"];
  return [tf];
}

function mergeCandles(...inputs: RuntimeChartCandle[][]) {
  const dedup = new Map<string, RuntimeChartCandle>();
  for (const group of inputs) {
    for (const candle of group) {
      if (!candle.time_utc) continue;
      dedup.set(candle.time_utc, candle);
    }
  }
  return [...dedup.values()]
    .sort((a, b) => new Date(a.time_utc).getTime() - new Date(b.time_utc).getTime())
    .slice(-2000);
}

function parseHistoryCandles(payload: unknown): RuntimeChartCandle[] {
  const root =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const asArray = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.candles)
      ? (root?.candles as unknown[])
      : Array.isArray(root?.data)
        ? (root?.data as unknown[])
        : root?.data &&
            typeof root.data === "object" &&
            Array.isArray((root.data as Record<string, unknown>).candles)
          ? ((root.data as Record<string, unknown>).candles as unknown[])
          : [];

  return asArray
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const rawTime = row.time_utc ?? row.time ?? row.timeUtc ?? row.timestamp ?? row.ts;
      const open = Number(row.open ?? row.o);
      const high = Number(row.high ?? row.h);
      const low = Number(row.low ?? row.l);
      const close = Number(row.close ?? row.c);
      if ([open, high, low, close].some((n) => Number.isNaN(n))) return null;

      let iso = "";
      if (typeof rawTime === "number" && Number.isFinite(rawTime)) {
        const ms = rawTime > 10_000_000_000 ? rawTime : rawTime * 1000;
        iso = new Date(ms).toISOString();
      } else if (typeof rawTime === "string" && rawTime.trim()) {
        const ms = Date.parse(rawTime);
        if (!Number.isNaN(ms)) {
          iso = new Date(ms).toISOString();
        }
      }
      if (!iso) return null;

      return { time_utc: iso, open, high, low, close };
    })
    .filter((item): item is RuntimeChartCandle => Boolean(item));
}

function pickNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractWsTickForSymbol(raw: unknown, symbol: string) {
  const wanted = normalizeSymbolKey(symbol);
  if (!wanted) return null;

  const parseQuote = (value: unknown) => {
    if (!isObject(value)) return null;
    const incomingSymbol = normalizeSymbolKey(
      typeof value.symbol === "string"
        ? value.symbol
        : typeof value.instrument === "string"
          ? value.instrument
          : ""
    );
    if (!incomingSymbol || incomingSymbol !== wanted) return null;

    const bid = pickNumber(value.bid);
    const ask = pickNumber(value.ask);
    const mid = pickNumber(value.mid);
    const price = pickNumber(value.price);
    const px = mid ?? price ?? (bid !== undefined && ask !== undefined ? (bid + ask) / 2 : bid ?? ask);
    if (px === undefined) return null;

    const ts = pickNumber(value.timestamp ?? value.ts ?? value.time);
    return { price: px, timestamp: ts };
  };

  const direct = parseQuote(raw);
  if (direct) return direct;

  if (!isObject(raw)) return null;
  const candidates = [raw.prices, raw.quotes, raw.items, raw.data, raw.payload, raw.tick, raw.quote];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const quote = parseQuote(item);
        if (quote) return quote;
      }
    } else {
      const quote = parseQuote(candidate);
      if (quote) return quote;
    }
  }

  return null;
}

function toMs(timestamp?: number) {
  if (!timestamp) return Date.now();
  return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
}

function timeframeToMinutes(timeframe: string) {
  const tf = timeframe.trim().toUpperCase();
  if (tf === "M1") return 1;
  if (tf === "M5") return 5;
  if (tf === "M15") return 15;
  if (tf === "M30") return 30;
  if (tf === "H1") return 60;
  if (tf === "H4") return 240;
  return 1;
}

export function useRuntimeChartData({
  symbol,
  timeframeLabel,
  normalizedFallback,
  fallbackSignature,
  defaultVisibleBars,
  historyTargetBars,
  dataMode = "live",
  useWebSocket = true,
  livePrice,
  liveTimestamp,
}: UseRuntimeChartDataOptions) {
  const isHistorical = dataMode === "historical";
  const isLive = !isHistorical;
  const backfillAttemptsRef = useRef<Map<string, number>>(new Map());
  const appliedSnapshotRef = useRef<string>("");
  const [candles, setCandles] = useState<RuntimeChartCandle[]>(normalizedFallback);
  const [wsTicks, setWsTicks] = useState(0);
  const [wsLive, setWsLive] = useState<{ price?: number; timestamp?: number }>({});
  const [liveBoundaryIso, setLiveBoundaryIso] = useState<string | null>(null);

  const wsSymbol = useMemo(() => normalizeSymbolKey(symbol), [symbol]);
  const timeframeMin = useMemo(() => timeframeToMinutes(timeframeLabel), [timeframeLabel]);
  const resolvedHistoryTargetBars = useMemo(
    () => Math.min(2000, Math.max(defaultVisibleBars, Math.floor(historyTargetBars ?? defaultVisibleBars))),
    [defaultVisibleBars, historyTargetBars]
  );
  const effectiveLivePrice = isLive ? (wsLive.price ?? livePrice) : undefined;
  const effectiveLiveTimestamp = isLive ? (wsLive.timestamp ?? liveTimestamp) : undefined;

  useEffect(() => {
    const nextSnapshot = `${normalizeSymbolKey(symbol)}|${timeframeLabel}|${fallbackSignature}|${dataMode}`;
    if (appliedSnapshotRef.current === nextSnapshot) {
      return;
    }
    appliedSnapshotRef.current = nextSnapshot;

    setCandles(normalizedFallback);
    setWsTicks(0);
    setWsLive({});
    setLiveBoundaryIso(null);
  }, [dataMode, fallbackSignature, normalizedFallback, symbol, timeframeLabel]);

  useEffect(() => {
    if (!isLive || !symbol) return;
    let cancelled = false;
    const backfillKey = `${normalizeSymbolKey(symbol)}|${timeframeLabel}|${resolvedHistoryTargetBars}`;

    async function backfillHistory() {
      if (candles.length >= resolvedHistoryTargetBars) {
        return;
      }
      const attempts = backfillAttemptsRef.current.get(backfillKey) ?? 0;
      if (attempts >= 3) {
        return;
      }
      backfillAttemptsRef.current.set(backfillKey, attempts + 1);

      const aliases = timeframeAliases(timeframeLabel);
      for (const tf of aliases) {
        try {
          const params = new URLSearchParams();
          const fetchLimit = Math.min(2000, Math.max(resolvedHistoryTargetBars, 120));
          params.set("limit", String(fetchLimit));
          const url = `/api/history/${encodeURIComponent(symbol)}/${encodeURIComponent(tf)}?${params.toString()}`;
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) continue;
          const payload = (await response.json()) as unknown;
          const history = parseHistoryCandles(payload);
          if (history.length === 0) continue;
          if (cancelled) return;
          setCandles((current) => mergeCandles(history, current));
          return;
        } catch {
          continue;
        }
      }
    }

    void backfillHistory();
    return () => {
      cancelled = true;
    };
  }, [candles.length, isLive, resolvedHistoryTargetBars, symbol, timeframeLabel]);

  useEffect(() => {
    if (!isLive || !useWebSocket || !wsSymbol) return;

    let closedByUnmount = false;
    let reconnectTimeout: number | null = null;
    let ws: WebSocket | null = null;
    const connect = () => {
      ws = new WebSocket(getMarketWsUrl([wsSymbol], 1));

      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data) as unknown;
          const tick = extractWsTickForSymbol(raw, wsSymbol);
          if (!tick) return;
          setWsTicks((v) => v + 1);
          setWsLive({
            price: tick.price,
            timestamp: tick.timestamp,
          });
        } catch {
          return;
        }
      };

      ws.onclose = () => {
        if (closedByUnmount) return;
        reconnectTimeout = window.setTimeout(() => connect(), 1000);
      };
    };

    connect();
    return () => {
      closedByUnmount = true;
      if (reconnectTimeout !== null) {
        window.clearTimeout(reconnectTimeout);
      }
      ws?.close();
    };
  }, [isLive, useWebSocket, wsSymbol]);

  useEffect(() => {
    if (!isLive || effectiveLivePrice === undefined || Number.isNaN(effectiveLivePrice)) return;
    const ms = toMs(effectiveLiveTimestamp);
    const bucketMs = timeframeMin * 60 * 1000;
    const bucketStartMs = Math.floor(ms / bucketMs) * bucketMs;
    const bucketIso = new Date(bucketStartMs).toISOString();
    setLiveBoundaryIso((current) => current ?? bucketIso);

    setCandles((current) => {
      if (current.length === 0) {
        return [{
          time_utc: bucketIso,
          open: effectiveLivePrice,
          high: effectiveLivePrice,
          low: effectiveLivePrice,
          close: effectiveLivePrice,
        }];
      }

      const last = current[current.length - 1];
      const lastBucketMs = new Date(last.time_utc).getTime();

      if (bucketStartMs === lastBucketMs) {
        const next = [...current];
        next[next.length - 1] = {
          ...last,
          high: Math.max(last.high, effectiveLivePrice),
          low: Math.min(last.low, effectiveLivePrice),
          close: effectiveLivePrice,
        };
        return next;
      }

      if (bucketStartMs > lastBucketMs) {
        return mergeCandles(current, [{
          time_utc: bucketIso,
          open: last.close,
          high: Math.max(last.close, effectiveLivePrice),
          low: Math.min(last.close, effectiveLivePrice),
          close: effectiveLivePrice,
        }]);
      }

      const idx = current.findIndex((candle) => candle.time_utc === bucketIso);
      if (idx >= 0) {
        const target = current[idx];
        const next = [...current];
        next[idx] = {
          ...target,
          high: Math.max(target.high, effectiveLivePrice),
          low: Math.min(target.low, effectiveLivePrice),
          close: effectiveLivePrice,
        };
        return next;
      }

      return current;
    });
  }, [effectiveLivePrice, effectiveLiveTimestamp, isLive, timeframeMin]);

  return {
    candles,
    setCandles,
    wsTicks: isLive ? wsTicks : 0,
    wsLive: isLive ? wsLive : {},
    liveBoundaryIso: isLive ? liveBoundaryIso : null,
    effectiveLivePrice,
    effectiveLiveTimestamp,
    isHistorical,
    isLive,
  };
}
