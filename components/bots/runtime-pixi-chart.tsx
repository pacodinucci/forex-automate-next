"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BotRuntimeH4Candle } from "@/lib/types";
import { getMarketWsUrl } from "@/lib/market-stream";
import { ZoomIn, ZoomOut } from "lucide-react";

type Props = {
  title: string;
  stageLabel: string;
  timeframeLabel: string;
  symbol: string;
  candlesFallback?: BotRuntimeH4Candle[];
  continuationLevel?: number;
  height?: number;
  livePrice?: number;
  liveTimestamp?: number;
  currentLeg?: number;
  showLegLabels?: boolean;
  pivotStrength?: number;
};

type Candle = {
  time_utc: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type DrawLayout = {
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  innerWidth: number;
  innerHeight: number;
};

type VisibleLeg = {
  legId: number;
  startIdx: number;
  endIdx: number;
  high: number;
  low: number;
  direction: "bull" | "bear";
  startPrice: number;
  endPrice: number;
};

type BreakLevel = {
  price: number;
  direction: "bull" | "bear";
};

type CandidateLevels = {
  continuationPrice: number;
  continuationDirection: "bull" | "bear";
  reversalPrice: number;
  reversalDirection: "bull" | "bear";
};

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

function stageBadgeClass(stageLabel: string) {
  const stage = stageLabel.toLowerCase();
  if (stage.includes("entry")) return "bg-blue-700";
  if (stage.includes("breakout")) return "bg-violet-700";
  if (stage.includes("legs")) return "bg-teal-700";
  return "bg-slate-600";
}

function normalizeFallback(candlesFallback: BotRuntimeH4Candle[]) {
  const dedup = new Map<string, Candle>();
  for (const candle of candlesFallback) {
    dedup.set(candle.time_utc, {
      time_utc: candle.time_utc,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });
  }
  return [...dedup.values()].sort((a, b) => new Date(a.time_utc).getTime() - new Date(b.time_utc).getTime());
}

function toMs(timestamp?: number) {
  if (!timestamp) return Date.now();
  return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
}

function formatXAxisLabel(iso: string, timeframeMin: number) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (timeframeMin >= 60) {
    return date.toLocaleString([], {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: timeframeMin <= 1 ? "2-digit" : undefined,
    hour12: false,
  });
}

type Pivot = {
  pivotType: "high" | "low";
  index: number;
  pivotPrice: number;
};

function findPivots(candles: Candle[], strength: number): Pivot[] {
  const pivots: Pivot[] = [];
  if (candles.length === 0) return pivots;
  const s = Math.max(1, Math.floor(strength));

  for (let i = s; i < candles.length - s; i += 1) {
    const hi = candles[i].high;
    const lo = candles[i].low;

    let isPivotHigh = true;
    let isPivotLow = true;
    for (let j = i - s; j <= i + s; j += 1) {
      if (j === i) continue;
      if (hi <= candles[j].high) isPivotHigh = false;
      if (lo >= candles[j].low) isPivotLow = false;
      if (!isPivotHigh && !isPivotLow) break;
    }

    if (isPivotHigh) {
      pivots.push({ pivotType: "high", index: i, pivotPrice: hi });
    }
    if (isPivotLow) {
      pivots.push({ pivotType: "low", index: i, pivotPrice: lo });
    }
  }

  return pivots.sort((a, b) => a.index - b.index);
}

function compressPivots(pivots: Pivot[]): Pivot[] {
  if (pivots.length === 0) return [];
  const out: Pivot[] = [pivots[0]];
  for (const p of pivots.slice(1)) {
    const last = out[out.length - 1];
    if (p.pivotType !== last.pivotType) {
      out.push(p);
      continue;
    }
    if (p.pivotType === "high") {
      if (p.pivotPrice >= last.pivotPrice) out[out.length - 1] = p;
    } else {
      if (p.pivotPrice <= last.pivotPrice) out[out.length - 1] = p;
    }
  }
  return out;
}

function buildLegsExtended(candles: Candle[], pivots: Pivot[]): VisibleLeg[] {
  if (pivots.length < 2) return [];
  const [p0, p1] = pivots;
  if (p0.pivotType === p1.pivotType) return [];

  let direction: "bull" | "bear";
  let start = p0;
  let extreme = p1;
  let refLow: number | null = null;
  let refHigh: number | null = null;

  if (p0.pivotType === "low" && p1.pivotType === "high") {
    direction = "bull";
    refLow = p0.pivotPrice;
  } else {
    direction = "bear";
    refHigh = p0.pivotPrice;
  }

  const legs: VisibleLeg[] = [];
  const appendLeg = (legStart: Pivot, legEnd: Pivot, legDirection: "bull" | "bear") => {
    const from = Math.min(legStart.index, legEnd.index);
    const to = Math.max(legStart.index, legEnd.index);
    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    for (let i = from; i <= to; i += 1) {
      high = Math.max(high, candles[i].high);
      low = Math.min(low, candles[i].low);
    }
    legs.push({
      legId: legs.length + 1,
      startIdx: from,
      endIdx: to,
      high,
      low,
      direction: legDirection,
      startPrice: legStart.pivotPrice,
      endPrice: legEnd.pivotPrice,
    });
  };

  for (const p of pivots.slice(2)) {
    if (direction === "bear") {
      if (p.pivotType === "low") {
        if (p.pivotPrice <= extreme.pivotPrice) {
          extreme = p;
        }
      } else {
        if (refHigh !== null && p.pivotPrice > refHigh) {
          appendLeg(start, extreme, "bear");
          direction = "bull";
          start = extreme;
          extreme = p;
          refLow = start.pivotPrice;
          refHigh = null;
        } else {
          refHigh = p.pivotPrice;
        }
      }
    } else {
      if (p.pivotType === "high") {
        if (p.pivotPrice >= extreme.pivotPrice) {
          extreme = p;
        }
      } else {
        if (refLow !== null && p.pivotPrice < refLow) {
          appendLeg(start, extreme, "bull");
          direction = "bear";
          start = extreme;
          extreme = p;
          refHigh = start.pivotPrice;
          refLow = null;
        } else {
          refLow = p.pivotPrice;
        }
      }
    }
  }

  appendLeg(start, extreme, direction);
  return legs;
}

function getBreakLevelFromLegs(legs: VisibleLeg[]): BreakLevel | null {
  if (legs.length < 2) return null;
  const current = legs[legs.length - 1];
  for (let i = legs.length - 2; i >= 0; i -= 1) {
    const previous = legs[i];
    if (previous.direction !== current.direction) continue;
    return {
      price: previous.endPrice,
      direction: current.direction,
    };
  }
  return null;
}

function getCandidateLevelsForOpenSegment(legs: VisibleLeg[], candles: Candle[]): CandidateLevels | null {
  if (legs.length === 0 || candles.length === 0) return null;
  const lastLeg = legs[legs.length - 1];
  const hasUnconfirmedTail = candles.length - 1 > lastLeg.endIdx;
  if (!hasUnconfirmedTail) return null;

  if (lastLeg.direction === "bear") {
    return {
      continuationPrice: lastLeg.endPrice,
      continuationDirection: "bear",
      reversalPrice: lastLeg.startPrice,
      reversalDirection: "bull",
    };
  }

  return {
    continuationPrice: lastLeg.endPrice,
    continuationDirection: "bull",
    reversalPrice: lastLeg.startPrice,
    reversalDirection: "bear",
  };
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

function mergeCandles(...inputs: Candle[][]) {
  const dedup = new Map<string, Candle>();
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

function parseHistoryCandles(payload: unknown): Candle[] {
  const root =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const asArray = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.candles)
      ? (root?.candles as unknown[])
      : Array.isArray(root?.data)
        ? (root?.data as unknown[])
        : root?.data && typeof root.data === "object" && Array.isArray((root.data as Record<string, unknown>).candles)
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
    .filter((item): item is Candle => Boolean(item));
}

function normalizeSymbolKey(value: string | undefined | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
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
    return {
      price: px,
      timestamp: ts,
    };
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

export default function RuntimePixiChart({
  title,
  stageLabel,
  timeframeLabel,
  symbol,
  candlesFallback = [],
  continuationLevel,
  height = 360,
  livePrice,
  liveTimestamp,
  currentLeg,
  showLegLabels = false,
  pivotStrength,
}: Props) {
  const DEFAULT_VISIBLE_BARS = 20;
  const ZOOM_IN_FACTOR = 0.84;
  const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;
  const PAN_SENSITIVITY = 1.9;
  const PAN_ACCEL_MAX = 2.2;
  const Y_ZOOM_STEP = 0.008;
  const Y_ZOOM_MIN = 0.4;
  const Y_ZOOM_MAX = 6.0;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<import("pixi.js").Application | null>(null);
  const drawLayoutRef = useRef<DrawLayout | null>(null);
  const rangeRef = useRef<{ start: number; end: number } | null>(null);
  const draggingRef = useRef<{ active: boolean; x: number; ts: number }>({ active: false, x: 0, ts: 0 });
  const yScaleDragRef = useRef<{ active: boolean; y: number; zoom: number; anchorRatio: number; anchorPrice: number } | null>(null);
  const yScaleAnchorRef = useRef<{ ratio: number; price: number } | null>(null);
  const yScaleMetaRef = useRef<{ pTop: number; pRange: number; marginTop: number; innerHeight: number } | null>(null);
  const userInteractedRef = useRef(false);
  const appliedSnapshotRef = useRef<string>("");
  const backfillAttemptsRef = useRef<Map<string, number>>(new Map());

  const [width, setWidth] = useState(900);
  const [appReadyTick, setAppReadyTick] = useState(0);
  const [candles, setCandles] = useState<Candle[]>(normalizeFallback(candlesFallback));
  const [wsTicks, setWsTicks] = useState(0);
  const [wsLive, setWsLive] = useState<{ price?: number; timestamp?: number }>({});
  const [liveBoundaryIso, setLiveBoundaryIso] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
  const [yZoom, setYZoom] = useState(1);

  const timeframeMin = useMemo(() => timeframeToMinutes(timeframeLabel), [timeframeLabel]);
  const effectivePivotStrength = useMemo(
    () => Math.max(1, Math.floor(Number.isFinite(Number(pivotStrength)) ? Number(pivotStrength) : 2)),
    [pivotStrength]
  );
  const fallbackSignature = useMemo(
    () =>
      candlesFallback
        .map((candle) => `${candle.time_utc}:${candle.open}:${candle.high}:${candle.low}:${candle.close}`)
        .join("|"),
    [candlesFallback]
  );
  const normalizedFallback = useMemo(() => normalizeFallback(candlesFallback), [candlesFallback]);
  const wsSymbol = useMemo(() => normalizeSymbolKey(symbol), [symbol]);
  const effectiveLivePrice = wsLive.price ?? livePrice;
  const effectiveLiveTimestamp = wsLive.timestamp ?? liveTimestamp;
  const legs = useMemo(() => {
    const pivots = compressPivots(findPivots(candles, effectivePivotStrength));
    return buildLegsExtended(candles, pivots);
  }, [candles, effectivePivotStrength]);
  const candidateLevels = useMemo(() => getCandidateLevelsForOpenSegment(legs, candles), [legs, candles]);

  useEffect(() => {
    rangeRef.current = range;
  }, [range]);

  useEffect(() => {
    const nextSnapshot = `${normalizeSymbolKey(symbol)}|${timeframeLabel}|${fallbackSignature}`;
    if (appliedSnapshotRef.current === nextSnapshot) {
      return;
    }
    appliedSnapshotRef.current = nextSnapshot;

    setCandles(normalizedFallback);
    setWsTicks(0);
    setRange(null);
    setWsLive({});
    setLiveBoundaryIso(null);
    setYZoom(1);
    yScaleAnchorRef.current = null;
  }, [fallbackSignature, symbol, timeframeLabel, normalizedFallback]);

  useEffect(() => {
    let cancelled = false;
    if (!symbol) return;
    const backfillKey = `${normalizeSymbolKey(symbol)}|${timeframeLabel}`;

    async function backfillHistory() {
      // Avoid extra traffic when we already have enough bars from runtime/ws.
      if (candles.length >= DEFAULT_VISIBLE_BARS) {
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
          params.set("limit", String(Math.max(DEFAULT_VISIBLE_BARS * 5, 120)));
          const url = `/api/history/${encodeURIComponent(symbol)}/${encodeURIComponent(tf)}?${params.toString()}`;
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) {
            continue;
          }
          const payload = (await response.json()) as unknown;
          const history = parseHistoryCandles(payload);
          if (history.length === 0) {
            continue;
          }
          if (cancelled) return;
          setCandles((current) => mergeCandles(history, current));
          return;
        } catch {
          continue;
        }
      }

      if (!cancelled) {
        window.setTimeout(() => {
          if (!cancelled) {
            setCandles((current) => [...current]);
          }
        }, 1500);
      }
    }

    void backfillHistory();
    return () => {
      cancelled = true;
    };
  }, [candles.length, symbol, timeframeLabel]);

  useEffect(() => {
    if (!wsSymbol) return;

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
  }, [wsSymbol]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 900;
      setWidth(Math.max(380, Math.floor(next)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let mounted = true;
    async function setup() {
      if (!hostRef.current || appRef.current) return;
      const { Application } = await import("pixi.js");
      if (!mounted || !hostRef.current) return;
      hostRef.current.innerHTML = "";
      const app = new Application({
        width,
        height,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        backgroundAlpha: 0,
      });
      const view = app.view as HTMLCanvasElement;
      view.style.width = "100%";
      view.style.height = `${height}px`;
      hostRef.current.appendChild(view);
      appRef.current = app;
      setAppReadyTick((v) => v + 1);
    }
    void setup();
    return () => {
      mounted = false;
      if (appRef.current) {
        appRef.current.destroy(true, true);
        appRef.current = null;
      }
    };
  }, [height, width]);

  useEffect(() => {
    if (candles.length === 0) {
      setRange(null);
      return;
    }
    setRange((current) => {
      const end = candles.length - 1;
      if (!current) {
        const initialVisible = Math.min(DEFAULT_VISIBLE_BARS, candles.length);
        return { start: Math.max(0, end - initialVisible + 1), end };
      }

      if (userInteractedRef.current) {
        const span = current.end - current.start;
        const nextEnd = end;
        return {
          start: Math.max(0, Math.min(current.start, nextEnd)),
          end: Math.max(0, Math.min(current.start + span, nextEnd)),
        };
      }

      const span = current.end - current.start;
      return { start: Math.max(0, end - span), end };
    });
  }, [candles.length]);

  useEffect(() => {
    if (effectiveLivePrice === undefined || Number.isNaN(effectiveLivePrice)) return;
    const ms = toMs(effectiveLiveTimestamp);
    const bucketMs = timeframeMin * 60 * 1000;
    const bucketStartMs = Math.floor(ms / bucketMs) * bucketMs;
    const bucketIso = new Date(bucketStartMs).toISOString();
    setLiveBoundaryIso((current) => current ?? bucketIso);

    setCandles((current) => {
      if (current.length === 0) {
        return [
          {
            time_utc: bucketIso,
            open: effectiveLivePrice,
            high: effectiveLivePrice,
            low: effectiveLivePrice,
            close: effectiveLivePrice,
          },
        ];
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
        return mergeCandles(current, [
          {
            time_utc: bucketIso,
            open: last.close,
            high: Math.max(last.close, effectiveLivePrice),
            low: Math.min(last.close, effectiveLivePrice),
            close: effectiveLivePrice,
          },
        ]);
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

  }, [effectiveLivePrice, effectiveLiveTimestamp, timeframeMin]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const canvas = app.view as HTMLCanvasElement;

    const applyZoom = (factor: number, anchorRatio: number) => {
      const current = rangeRef.current;
      if (!current || candles.length <= 2) return;
      userInteractedRef.current = true;

      const ratio = Math.max(0, Math.min(1, anchorRatio));
      const anchor = current.start + Math.round((current.end - current.start) * ratio);
      const visible = current.end - current.start + 1;
      const nextVisible = Math.max(2, Math.min(candles.length, Math.round(visible * factor)));

      let start = anchor - Math.round(nextVisible * ratio);
      let end = start + nextVisible - 1;
      if (start < 0) {
        start = 0;
        end = nextVisible - 1;
      }
      if (end >= candles.length) {
        end = candles.length - 1;
        start = Math.max(0, end - nextVisible + 1);
      }
      setRange({ start, end });
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      const layout = drawLayoutRef.current;
      if (!layout || candles.length <= 2) return;

      event.preventDefault();
      const clampedX = Math.max(layout.marginLeft, Math.min(layout.marginLeft + layout.innerWidth, event.offsetX));
      const ratio = (clampedX - layout.marginLeft) / layout.innerWidth;
      const factor = event.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
      applyZoom(factor, ratio);
    };

    const onMouseDown = (event: MouseEvent) => {
      userInteractedRef.current = true;
      const layout = drawLayoutRef.current;
      const inPriceScale = Boolean(layout && event.offsetX >= layout.marginLeft + layout.innerWidth);
      if (inPriceScale) {
        const yMeta = yScaleMetaRef.current;
        if (yMeta) {
          const clampedY = Math.max(yMeta.marginTop, Math.min(yMeta.marginTop + yMeta.innerHeight, event.offsetY));
          const ratio = (clampedY - yMeta.marginTop) / yMeta.innerHeight;
          const anchorPrice = yMeta.pTop - ratio * yMeta.pRange;
          yScaleDragRef.current = {
            active: true,
            y: event.clientY,
            zoom: yZoom,
            anchorRatio: ratio,
            anchorPrice,
          };
          yScaleAnchorRef.current = { ratio, price: anchorPrice };
          canvas.style.cursor = "ns-resize";
          return;
        }
      }

      draggingRef.current = { active: true, x: event.clientX, ts: performance.now() };
      canvas.style.cursor = "grabbing";
    };

    const onMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      setCrosshair({ x: event.clientX - rect.left, y: event.clientY - rect.top });

      if (yScaleDragRef.current?.active) {
        const scale = yScaleDragRef.current;
        const dy = event.clientY - scale.y;
        const factor = Math.exp(-dy * Y_ZOOM_STEP);
        const nextZoom = Math.max(Y_ZOOM_MIN, Math.min(Y_ZOOM_MAX, scale.zoom * factor));
        yScaleAnchorRef.current = { ratio: scale.anchorRatio, price: scale.anchorPrice };
        setYZoom(nextZoom);
        canvas.style.cursor = "ns-resize";
        return;
      }

      const layout = drawLayoutRef.current;
      const isPriceScaleHover = Boolean(layout && event.offsetX >= layout.marginLeft + layout.innerWidth);
      if (!draggingRef.current.active) {
        canvas.style.cursor = isPriceScaleHover ? "ns-resize" : "crosshair";
        return;
      }
      const current = rangeRef.current;
      if (!layout || !current) return;

      const nowTs = performance.now();
      const dx = event.clientX - draggingRef.current.x;
      const dt = Math.max(1, nowTs - draggingRef.current.ts);
      draggingRef.current = { ...draggingRef.current, x: event.clientX, ts: nowTs };
      const visible = current.end - current.start + 1;
      const pxPerMs = Math.abs(dx) / dt;
      const accel = Math.min(PAN_ACCEL_MAX, 1 + pxPerMs * 3.5);
      const shift = Math.round(((-dx / layout.innerWidth) * visible) * PAN_SENSITIVITY * accel);
      if (shift === 0) return;

      let start = current.start + shift;
      let end = current.end + shift;
      if (start < 0) {
        start = 0;
        end = visible - 1;
      }
      if (end >= candles.length) {
        end = candles.length - 1;
        start = Math.max(0, end - visible + 1);
      }
      setRange({ start, end });
    };

    const onMouseUp = () => {
      draggingRef.current.active = false;
      if (yScaleDragRef.current) {
        yScaleDragRef.current.active = false;
      }
      canvas.style.cursor = "crosshair";
    };
    const onMouseLeave = () => {
      setCrosshair(null);
      canvas.style.cursor = "crosshair";
    };

    canvas.style.cursor = "crosshair";
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [appReadyTick, candles.length, yZoom]);

  function zoomByFactor(factor: number) {
    const current = rangeRef.current;
    if (!current || candles.length <= 2) return;
    userInteractedRef.current = true;
    const ratio = 0.5;
    const anchor = current.start + Math.round((current.end - current.start) * ratio);
    const visible = current.end - current.start + 1;
    const nextVisible = Math.max(2, Math.min(candles.length, Math.round(visible * factor)));

    let start = anchor - Math.round(nextVisible * ratio);
    let end = start + nextVisible - 1;
    if (start < 0) {
      start = 0;
      end = nextVisible - 1;
    }
    if (end >= candles.length) {
      end = candles.length - 1;
      start = Math.max(0, end - nextVisible + 1);
    }
    setRange({ start, end });
  }

  function resetView() {
    userInteractedRef.current = false;
    setYZoom(1);
    yScaleAnchorRef.current = null;
    if (candles.length === 0) return;
    const end = candles.length - 1;
    const visible = Math.min(DEFAULT_VISIBLE_BARS, candles.length);
    setRange({ start: Math.max(0, end - visible + 1), end });
  }

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;

    const draw = async () => {
      const { Graphics, Text, TextStyle } = await import("pixi.js");
      if (!appRef.current) return;

      app.renderer.resize(width, height);
      app.stage.removeChildren();

      const margin = { left: 56, right: 58, top: 12, bottom: 26 };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const bg = new Graphics();
      bg.lineStyle(1, 0xe2e8f0, 1);
      bg.beginFill(0xffffff, 1);
      bg.drawRect(0, 0, width, height);
      bg.endFill();
      app.stage.addChild(bg);

      const baseText = new TextStyle({
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 11,
        fill: 0x64748b,
      });

      if (candles.length === 0 || !range) {
        const t = new Text("Waiting WS ticks...", baseText);
        t.x = margin.left;
        t.y = margin.top + innerHeight / 2;
        app.stage.addChild(t);
        return;
      }

      const start = Math.max(0, Math.min(range.start, candles.length - 1));
      const end = Math.max(start, Math.min(range.end, candles.length - 1));
      const visible = candles.slice(start, end + 1);

      drawLayoutRef.current = {
        marginLeft: margin.left,
        marginRight: margin.right,
        marginTop: margin.top,
        marginBottom: margin.bottom,
        innerWidth,
        innerHeight,
      };

      const prices = visible.flatMap((c) => [c.low, c.high]);
      if (typeof continuationLevel === "number" && Number.isFinite(continuationLevel)) prices.push(continuationLevel);
      const max = Math.max(...prices);
      const min = Math.min(...prices);
      const baseRange = Math.max(max - min, 0.00002);
      const basePad = Math.max(baseRange * 0.1, 0.00002);
      const baseTop = max + basePad;
      const baseBottom = min - basePad;
      const basePRange = Math.max(baseTop - baseBottom, 0.00002);

      const clampedYZoom = Math.max(Y_ZOOM_MIN, Math.min(Y_ZOOM_MAX, yZoom));
      const pRange = Math.max(basePRange / clampedYZoom, 0.00002);
      const anchor = yScaleAnchorRef.current;
      let pTop: number;
      if (anchor) {
        const ratio = Math.max(0, Math.min(1, anchor.ratio));
        pTop = anchor.price + ratio * pRange;
      } else {
        const center = (baseTop + baseBottom) / 2;
        pTop = center + pRange / 2;
      }
      const pBottom = pTop - pRange;
      const toY = (p: number) => margin.top + ((pTop - p) / pRange) * innerHeight;

      yScaleMetaRef.current = {
        pTop,
        pRange,
        marginTop: margin.top,
        innerHeight,
      };

      const grid = new Graphics();
      grid.lineStyle(1, 0xe2e8f0, 1);
      for (let i = 0; i <= 5; i += 1) {
        const y = margin.top + (innerHeight * i) / 5;
        grid.moveTo(margin.left, y);
        grid.lineTo(width - margin.right, y);
      }
      for (let i = 0; i <= 8; i += 1) {
        const x = margin.left + (innerWidth * i) / 8;
        grid.moveTo(x, margin.top);
        grid.lineTo(x, height - margin.bottom);
      }
      app.stage.addChild(grid);

      for (let i = 0; i <= 5; i += 1) {
        const y = margin.top + (innerHeight * i) / 5;
        const value = pTop - (pRange * i) / 5;
        const label = new Text(value.toFixed(5), baseText);
        label.x = width - margin.right + 4;
        label.y = y - 7;
        app.stage.addChild(label);
      }

      for (let i = 0; i <= 8; i += 1) {
        const x = margin.left + (innerWidth * i) / 8;
        const ratio = i / 8;
        const idx = Math.max(0, Math.min(visible.length - 1, Math.round((visible.length - 1) * ratio)));
        const timeLabel = formatXAxisLabel(visible[idx].time_utc, timeframeMin);
        if (!timeLabel) continue;
        const label = new Text(timeLabel, baseText);
        label.x = Math.max(margin.left, Math.min(width - margin.right - label.width, x - label.width / 2));
        label.y = height - margin.bottom + 6;
        app.stage.addChild(label);
      }

      if (typeof continuationLevel === "number" && Number.isFinite(continuationLevel)) {
        const y = toY(continuationLevel);
        const line = new Graphics();
        line.lineStyle(1, 0x2563eb, 1);
        line.moveTo(margin.left, y);
        line.lineTo(width - margin.right, y);
        app.stage.addChild(line);
      }

      const slot = innerWidth / Math.max(1, visible.length);
      const candleW = Math.max(2, Math.min(10, slot * 0.65));

      if (liveBoundaryIso) {
        const boundaryTime = new Date(liveBoundaryIso).getTime();
        if (!Number.isNaN(boundaryTime)) {
          const boundaryIdx = visible.findIndex((candle) => new Date(candle.time_utc).getTime() >= boundaryTime);
          if (boundaryIdx > 0) {
            const x = margin.left + boundaryIdx * slot;
            const sep = new Graphics();
            sep.lineStyle(1, 0x475569, 0.8);
            const segment = 5;
            const gap = 4;
            for (let y = margin.top; y < height - margin.bottom; y += segment + gap) {
              const y2 = Math.min(height - margin.bottom, y + segment);
              sep.moveTo(x, y);
              sep.lineTo(x, y2);
            }
            app.stage.addChild(sep);

            const label = new Text("Live", new TextStyle({
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 10,
              fill: 0x334155,
              fontWeight: "600",
            }));
            label.x = Math.min(width - margin.right - label.width, x + 4);
            label.y = margin.top + 2;
            app.stage.addChild(label);
          }
        }
      }

      if (showLegLabels) {
        const visibleLegs = legs.filter((leg) => leg.endIdx >= start && leg.startIdx <= end);
        visibleLegs.forEach((leg) => {
          const clippedStart = Math.max(start, leg.startIdx);
          const clippedEnd = Math.min(end, leg.endIdx);
          const localStart = clippedStart - start;
          const localEnd = clippedEnd - start;
          let segmentHigh = Number.NEGATIVE_INFINITY;
          let segmentLow = Number.POSITIVE_INFINITY;
          for (let i = clippedStart; i <= clippedEnd; i += 1) {
            segmentHigh = Math.max(segmentHigh, candles[i].high);
            segmentLow = Math.min(segmentLow, candles[i].low);
          }
          const left = margin.left + localStart * slot + slot * 0.1;
          const right = margin.left + (localEnd + 1) * slot - slot * 0.1;
          const top = toY(segmentHigh);
          const bottom = toY(segmentLow);
          const widthPx = Math.max(2, right - left);
          const heightPx = Math.max(2, bottom - top);
          const lineColor = leg.direction === "bull" ? 0x0f766e : 0xb91c1c;
          const fillColor = leg.direction === "bull" ? 0x14b8a6 : 0xef4444;

          const box = new Graphics();
          box.lineStyle(1, lineColor, 0.75);
          box.beginFill(fillColor, 0.08);
          box.drawRect(left, top, widthPx, heightPx);
          box.endFill();
          app.stage.addChild(box);

          const label = new Text(`Leg ${leg.legId}`, new TextStyle({
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 10,
            fill: lineColor,
            fontWeight: "600",
          }));
          label.x = left + 4;
          label.y = Math.max(margin.top + 2, top - 14);
          app.stage.addChild(label);
        });

        const breakLevel = getBreakLevelFromLegs(legs);
        if (breakLevel) {
          const y = toY(breakLevel.price);
          const lineColor = breakLevel.direction === "bull" ? 0x1d4ed8 : 0xdc2626;
          const dashed = new Graphics();
          dashed.lineStyle(1, lineColor, 0.95);
          const segment = 6;
          const gap = 4;
          const startX = margin.left;
          const endX = width - margin.right;
          for (let x = startX; x < endX; x += segment + gap) {
            const x2 = Math.min(endX, x + segment);
            dashed.moveTo(x, y);
            dashed.lineTo(x2, y);
          }
          app.stage.addChild(dashed);

          const text = breakLevel.direction === "bull" ? "Break: prev up high" : "Break: prev down low";
          const label = new Text(`${text} ${breakLevel.price.toFixed(5)}`, new TextStyle({
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 10,
            fill: lineColor,
            fontWeight: "600",
          }));
          label.x = margin.left + 4;
          label.y = Math.max(margin.top + 2, y - 14);
          app.stage.addChild(label);
        }

        if (candidateLevels) {
          const drawDashed = (y: number, color: number) => {
            const dashed = new Graphics();
            dashed.lineStyle(1, color, 0.9);
            const segment = 7;
            const gap = 4;
            for (let x = margin.left; x < width - margin.right; x += segment + gap) {
              const x2 = Math.min(width - margin.right, x + segment);
              dashed.moveTo(x, y);
              dashed.lineTo(x2, y);
            }
            app.stage.addChild(dashed);
          };

          const continuationColor = candidateLevels.continuationDirection === "bull" ? 0x0f766e : 0xb91c1c;
          const reversalColor = candidateLevels.reversalDirection === "bull" ? 0x0f766e : 0xb91c1c;
          const yCont = toY(candidateLevels.continuationPrice);
          const yRev = toY(candidateLevels.reversalPrice);
          drawDashed(yCont, continuationColor);
          drawDashed(yRev, reversalColor);

          const contLabel = new Text(
            `Cont ${candidateLevels.continuationDirection}: ${candidateLevels.continuationPrice.toFixed(5)}`,
            new TextStyle({
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 10,
              fill: continuationColor,
              fontWeight: "600",
            })
          );
          contLabel.x = margin.left + 4;
          contLabel.y = Math.max(margin.top + 2, yCont - 14);
          app.stage.addChild(contLabel);

          const revLabel = new Text(
            `Rev ${candidateLevels.reversalDirection}: ${candidateLevels.reversalPrice.toFixed(5)}`,
            new TextStyle({
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 10,
              fill: reversalColor,
              fontWeight: "600",
            })
          );
          revLabel.x = margin.left + 4;
          revLabel.y = Math.max(margin.top + 16, yRev + 2);
          app.stage.addChild(revLabel);
        }
      }

      visible.forEach((candle, i) => {
        const x = margin.left + i * slot + slot / 2;
        const yH = toY(candle.high);
        const yL = toY(candle.low);
        const yO = toY(candle.open);
        const yC = toY(candle.close);
        const top = Math.min(yO, yC);
        const bodyH = Math.max(1, Math.abs(yO - yC));
        const bull = candle.close >= candle.open;
        const color = bull ? 0x26a69a : 0xef5350;

        const wick = new Graphics();
        wick.lineStyle(1, color, 1);
        wick.moveTo(x, yH);
        wick.lineTo(x, yL);
        app.stage.addChild(wick);

        const body = new Graphics();
        body.lineStyle(1, color, 1);
        body.beginFill(color, 0.95);
        body.drawRect(x - candleW / 2, top, candleW, bodyH);
        body.endFill();
        app.stage.addChild(body);
      });

      if (crosshair) {
        const inX = crosshair.x >= margin.left && crosshair.x <= width - margin.right;
        const inY = crosshair.y >= margin.top && crosshair.y <= height - margin.bottom;
        if (inX && inY) {
          const ch = new Graphics();
          ch.lineStyle(1, 0x94a3b8, 1);
          ch.moveTo(crosshair.x, margin.top);
          ch.lineTo(crosshair.x, height - margin.bottom);
          ch.moveTo(margin.left, crosshair.y);
          ch.lineTo(width - margin.right, crosshair.y);
          app.stage.addChild(ch);
        }
      }
    };

    void draw();
  }, [appReadyTick, candles, candidateLevels, continuationLevel, crosshair, height, legs, liveBoundaryIso, range, timeframeMin, width]);

  return (
    <div className="relative rounded-md border bg-slate-50 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-800">{title} ({timeframeLabel})</div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${stageBadgeClass(stageLabel)}`}>
          {stageLabel}
        </span>
      </div>
      {showLegLabels ? (
        <div className="mb-2 text-xs text-slate-600">
          Current leg (runtime): {typeof currentLeg === "number" && Number.isFinite(currentLeg) ? Math.max(1, Math.floor(currentLeg)) : "-"}
        </div>
      ) : null}
      <div ref={hostRef} className="w-full rounded border border-slate-200" style={{ height }} />
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>
          {(range ? range.end - range.start + 1 : candles.length)}/{candles.length} bars | Ctrl+wheel zoom X | drag pan X | drag right scale zoom Y
        </span>
        <span>Source: ws+runtime ({symbol}) | ws ticks: {wsTicks}</span>
      </div>
      <div className="mt-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => zoomByFactor(ZOOM_IN_FACTOR)}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
            Zoom in
          </button>
          <button
            type="button"
            onClick={() => zoomByFactor(ZOOM_OUT_FACTOR)}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
            Zoom out
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Reset view
          </button>
        </div>
      </div>
    </div>
  );
}








