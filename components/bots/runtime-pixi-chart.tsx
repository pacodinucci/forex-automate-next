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
  overlayStructureFromTimeframe?: string;
  overlayStructureCandlesFallback?: BotRuntimeH4Candle[];
  tradeMarkers?: TradeMarker[];
  selectedTradeHighlight?: SelectedTradeHighlight | null;
  onDeselectSelectedTrade?: () => void;
  focusTimeUtc?: string | null;
  movingAverages?: RuntimeMovingAverageConfig[];
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

type XGeometry = {
  slot: number;
  visibleCount: number;
  gapStartX: number;
  plotEndX: number;
  plotTopY: number;
  plotBottomY: number;
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

type DrawableLeg = VisibleLeg & {
  drawStartIdx: number;
  drawEndIdx: number;
};

type TradeMarker = {
  id: string;
  time_utc: string;
  price: number;
  side?: "buy" | "sell" | "unknown";
  kind?: "entry" | "exit";
  result?: string;
  pnl_points?: number;
};

type SelectedTradeHighlight = {
  start_time?: string;
  end_time?: string;
  entry?: number;
  exit?: number;
  side?: "buy" | "sell" | "unknown";
};

export type RuntimeMovingAverageConfig = {
  kind: "sma" | "ema";
  period: number;
  color?: string;
  label?: string;
};

type RuntimeMovingAverageSeries = {
  key: string;
  kind: "sma" | "ema";
  period: number;
  color?: string;
  label: string;
  values: Array<number | null>;
};

function offsetLegStart(startIdx: number, endIdx: number) {
  if (startIdx < endIdx) return startIdx + 1;
  return startIdx;
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

function stageBadgeClass(stageLabel: string) {
  const stage = stageLabel.toLowerCase();
  if (stage.includes("entry")) return "bg-blue-700";
  if (stage.includes("breakout")) return "bg-violet-700";
  if (stage.includes("legs")) return "bg-teal-700";
  return "bg-slate-600";
}

function parseHexColor(color: string | undefined, fallback: number) {
  if (!color) return fallback;
  const hex = color.trim().replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return fallback;
  return Number.parseInt(hex, 16);
}

function buildSmaValues(candles: Candle[], period: number) {
  const out: Array<number | null> = Array.from({ length: candles.length }, () => null);
  if (period <= 0 || candles.length < period) return out;

  let rolling = 0;
  for (let i = 0; i < candles.length; i += 1) {
    rolling += candles[i].close;
    if (i >= period) {
      rolling -= candles[i - period].close;
    }
    if (i >= period - 1) {
      out[i] = rolling / period;
    }
  }

  return out;
}

function buildEmaValues(candles: Candle[], period: number) {
  const out: Array<number | null> = Array.from({ length: candles.length }, () => null);
  if (period <= 0 || candles.length < period) return out;

  let seed = 0;
  for (let i = 0; i < period; i += 1) {
    seed += candles[i].close;
  }
  let prev = seed / period;
  out[period - 1] = prev;

  const k = 2 / (period + 1);
  for (let i = period; i < candles.length; i += 1) {
    const next = candles[i].close * k + prev * (1 - k);
    out[i] = next;
    prev = next;
  }

  return out;
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

function lowerBound(values: number[], target: number) {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function upperBound(values: number[], target: number) {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function mapLegsToTarget(
  sourceLegs: VisibleLeg[],
  sourceCandles: Candle[],
  targetCandles: Candle[],
  sourceTfMin: number
): DrawableLeg[] {
  if (sourceLegs.length === 0 || sourceCandles.length === 0 || targetCandles.length === 0) return [];
  const targetTimes = targetCandles.map((c) => Date.parse(c.time_utc));
  if (targetTimes.some((ms) => Number.isNaN(ms))) return [];
  const targetFirstMs = targetTimes[0];
  const targetLastMs = targetTimes[targetTimes.length - 1];

  const sourceBarMs = Math.max(1, Math.floor(sourceTfMin)) * 60_000;
  const out: DrawableLeg[] = [];

  for (const leg of sourceLegs) {
    const startCandle = sourceCandles[leg.startIdx];
    const endCandle = sourceCandles[leg.endIdx];
    if (!startCandle || !endCandle) continue;

    const startMs = Date.parse(startCandle.time_utc);
    const endMs = Date.parse(endCandle.time_utc);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;

    const rangeStart = Math.min(startMs, endMs);
    const rangeEnd = Math.max(startMs, endMs) + Math.max(0, sourceBarMs - 1);

    // Skip legs that are fully outside the target chart time window.
    if (rangeEnd < targetFirstMs || rangeStart > targetLastMs) {
      continue;
    }

    const startPos = lowerBound(targetTimes, rangeStart);
    const endPos = upperBound(targetTimes, rangeEnd) - 1;
    if (startPos >= targetCandles.length || endPos < 0 || endPos < startPos) {
      continue;
    }
    const lastTargetIdx = targetCandles.length - 1;
    const drawStartIdx = Math.max(0, Math.min(startPos, lastTargetIdx));
    const drawEndIdx = Math.max(drawStartIdx, Math.min(endPos, lastTargetIdx));
    const shiftedDrawStartIdx = offsetLegStart(drawStartIdx, drawEndIdx);

    out.push({
      ...leg,
      drawStartIdx: shiftedDrawStartIdx,
      drawEndIdx,
    });
  }

  return out;
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
  overlayStructureFromTimeframe,
  overlayStructureCandlesFallback = [],
  tradeMarkers = [],
  selectedTradeHighlight = null,
  onDeselectSelectedTrade,
  focusTimeUtc = null,
  movingAverages = [],
}: Props) {
  const DEFAULT_VISIBLE_BARS_BASE = 20;
  const ZOOM_IN_FACTOR = 0.84;
  const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;
  const PAN_SENSITIVITY = 1.9;
  const PAN_ACCEL_MAX = 2.2;
  const Y_ZOOM_STEP = 0.008;
  const Y_ZOOM_MIN = 0.4;
  const Y_ZOOM_MAX = 6.0;
  const RIGHT_OFFSET_DEFAULT = 2.5;
  const RIGHT_OFFSET_MIN = 0;
  const RIGHT_OFFSET_MAX = 40;
  const RIGHT_OFFSET_DRAG_PX_PER_BAR = 26;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<import("pixi.js").Application | null>(null);
  const drawLayoutRef = useRef<DrawLayout | null>(null);
  const xGeometryRef = useRef<XGeometry | null>(null);
  const rangeRef = useRef<{ start: number; end: number } | null>(null);
  const draggingRef = useRef<{ active: boolean; x: number; y: number; ts: number }>({ active: false, x: 0, y: 0, ts: 0 });
  const yScaleDragRef = useRef<{ active: boolean; y: number; zoom: number; anchorRatio: number; anchorPrice: number } | null>(null);
  const rightOffsetDragRef = useRef<{ active: boolean; x: number; offsetBars: number } | null>(null);
  const yScaleAnchorRef = useRef<{ ratio: number; price: number } | null>(null);
  const yScaleMetaRef = useRef<{ pTop: number; pRange: number; marginTop: number; innerHeight: number } | null>(null);
  const userInteractedRef = useRef(false);
  const appliedSnapshotRef = useRef<string>("");
  const appliedOverlaySnapshotRef = useRef<string>("");
  const backfillAttemptsRef = useRef<Map<string, number>>(new Map());
  const lastFocusTimeRef = useRef<string>("");
  const selectedHighlightBoxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const highlightClickRef = useRef<{
    pending: boolean;
    startX: number;
    startY: number;
    startedInBox: boolean;
  }>({ pending: false, startX: 0, startY: 0, startedInBox: false });

  const [width, setWidth] = useState(900);
  const [appReadyTick, setAppReadyTick] = useState(0);
  const [candles, setCandles] = useState<Candle[]>(normalizeFallback(candlesFallback));
  const [wsTicks, setWsTicks] = useState(0);
  const [wsLive, setWsLive] = useState<{ price?: number; timestamp?: number }>({});
  const [liveBoundaryIso, setLiveBoundaryIso] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
  const [yZoom, setYZoom] = useState(1);
  const [yCenterPrice, setYCenterPrice] = useState<number | null>(null);
  const [rightOffsetBars, setRightOffsetBars] = useState(RIGHT_OFFSET_DEFAULT);
  const [overlayCandles, setOverlayCandles] = useState<Candle[]>(normalizeFallback(overlayStructureCandlesFallback));

  const timeframeMin = useMemo(() => timeframeToMinutes(timeframeLabel), [timeframeLabel]);
  const overlayTimeframeLabel = overlayStructureFromTimeframe?.trim();
  const overlayEnabled = Boolean(overlayTimeframeLabel);
  const overlayTimeframeMin = useMemo(
    () => timeframeToMinutes(overlayTimeframeLabel ?? timeframeLabel),
    [overlayTimeframeLabel, timeframeLabel]
  );
  const defaultVisibleBars = useMemo(() => {
    if (!overlayEnabled) return DEFAULT_VISIBLE_BARS_BASE;
    const ratio = Math.max(1, overlayTimeframeMin / Math.max(1, timeframeMin));
    return Math.max(DEFAULT_VISIBLE_BARS_BASE, Math.ceil(DEFAULT_VISIBLE_BARS_BASE * ratio));
  }, [overlayEnabled, overlayTimeframeMin, timeframeMin]);
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
  const overlayFallbackSignature = useMemo(
    () =>
      overlayStructureCandlesFallback
        .map((candle) => `${candle.time_utc}:${candle.open}:${candle.high}:${candle.low}:${candle.close}`)
        .join("|"),
    [overlayStructureCandlesFallback]
  );
  const normalizedOverlayFallback = useMemo(
    () => normalizeFallback(overlayStructureCandlesFallback),
    [overlayStructureCandlesFallback]
  );
  const wsSymbol = useMemo(() => normalizeSymbolKey(symbol), [symbol]);
  const effectiveLivePrice = wsLive.price ?? livePrice;
  const effectiveLiveTimestamp = wsLive.timestamp ?? liveTimestamp;
  const legs = useMemo(() => {
    const pivots = compressPivots(findPivots(candles, effectivePivotStrength));
    return buildLegsExtended(candles, pivots);
  }, [candles, effectivePivotStrength]);
  const overlayLegs = useMemo(() => {
    if (!overlayEnabled) return [];
    const pivots = compressPivots(findPivots(overlayCandles, effectivePivotStrength));
    return buildLegsExtended(overlayCandles, pivots);
  }, [overlayCandles, effectivePivotStrength, overlayEnabled]);
  const sourceLegs = overlayEnabled ? overlayLegs : legs;
  const sourceCandles = overlayEnabled ? overlayCandles : candles;
  const candidateLevels = useMemo(
    () => getCandidateLevelsForOpenSegment(sourceLegs, sourceCandles),
    [sourceCandles, sourceLegs]
  );
  const breakLevel = useMemo(() => getBreakLevelFromLegs(sourceLegs), [sourceLegs]);
  const drawableLegs = useMemo(
    () => mapLegsToTarget(sourceLegs, sourceCandles, candles, overlayEnabled ? overlayTimeframeMin : timeframeMin),
    [candles, overlayEnabled, overlayTimeframeMin, sourceCandles, sourceLegs, timeframeMin]
  );
  const movingAverageSeries = useMemo<RuntimeMovingAverageSeries[]>(() => {
    if (candles.length === 0 || movingAverages.length === 0) return [];

    return movingAverages
      .map((item, idx) => {
        const period = Math.max(1, Math.floor(item.period));
        const values = item.kind === "ema"
          ? buildEmaValues(candles, period)
          : buildSmaValues(candles, period);

        return {
          key: `${item.kind}:${period}:${idx}`,
          kind: item.kind,
          period,
          color: item.color,
          label: item.label ?? `${item.kind.toUpperCase()}(${period})`,
          values,
        } satisfies RuntimeMovingAverageSeries;
      })
      .filter((series) => series.values.some((value) => typeof value === "number"));
  }, [candles, movingAverages]);

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
    appliedOverlaySnapshotRef.current = "";
  }, [fallbackSignature, symbol, timeframeLabel, normalizedFallback]);

  useEffect(() => {
    if (!overlayEnabled) return;
    const nextSnapshot = `${normalizeSymbolKey(symbol)}|${overlayTimeframeLabel}|${overlayFallbackSignature}`;
    if (appliedOverlaySnapshotRef.current === nextSnapshot) {
      return;
    }
    appliedOverlaySnapshotRef.current = nextSnapshot;
    setOverlayCandles(normalizedOverlayFallback);
  }, [overlayEnabled, overlayFallbackSignature, overlayTimeframeLabel, normalizedOverlayFallback, symbol]);

  useEffect(() => {
    let cancelled = false;
    if (!symbol) return;
    const backfillKey = `${normalizeSymbolKey(symbol)}|${timeframeLabel}`;

    async function backfillHistory() {
      // Avoid extra traffic when we already have enough bars from runtime/ws.
      if (candles.length >= defaultVisibleBars) {
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
          params.set("limit", String(Math.max(defaultVisibleBars * 5, 120)));
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
  }, [candles.length, defaultVisibleBars, symbol, timeframeLabel]);

  useEffect(() => {
    let cancelled = false;
    if (!symbol || !overlayEnabled || !overlayTimeframeLabel) return;
    const backfillKey = `${normalizeSymbolKey(symbol)}|${overlayTimeframeLabel}|overlay`;

    async function backfillOverlayHistory() {
      if (overlayCandles.length >= defaultVisibleBars) {
        return;
      }
      const attempts = backfillAttemptsRef.current.get(backfillKey) ?? 0;
      if (attempts >= 3) {
        return;
      }
      backfillAttemptsRef.current.set(backfillKey, attempts + 1);

      const aliases = timeframeAliases(overlayTimeframeLabel);
      for (const tf of aliases) {
        try {
          const params = new URLSearchParams();
          params.set("limit", String(Math.max(defaultVisibleBars * 5, 120)));
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
          setOverlayCandles((current) => mergeCandles(history, current));
          return;
        } catch {
          continue;
        }
      }
    }

    void backfillOverlayHistory();
    return () => {
      cancelled = true;
    };
  }, [defaultVisibleBars, overlayCandles.length, overlayEnabled, overlayTimeframeLabel, symbol]);

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
        const initialVisible = Math.min(defaultVisibleBars, candles.length);
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
  }, [candles.length, defaultVisibleBars]);

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
      const activeBox = selectedHighlightBoxRef.current;
      const startedInBox = Boolean(
        activeBox &&
        event.offsetX >= activeBox.x &&
        event.offsetX <= activeBox.x + activeBox.w &&
        event.offsetY >= activeBox.y &&
        event.offsetY <= activeBox.y + activeBox.h
      );
      highlightClickRef.current = {
        pending: true,
        startX: event.clientX,
        startY: event.clientY,
        startedInBox,
      };
      if (startedInBox) {
        canvas.style.cursor = "pointer";
        return;
      }

      const layout = drawLayoutRef.current;
      const xGeometry = xGeometryRef.current;
      const inRightGap = Boolean(
        xGeometry &&
        event.offsetX >= xGeometry.gapStartX &&
        event.offsetX <= xGeometry.plotEndX &&
        event.offsetY >= xGeometry.plotTopY &&
        event.offsetY <= xGeometry.plotBottomY
      );
      if (inRightGap) {
        rightOffsetDragRef.current = {
          active: true,
          x: event.clientX,
          offsetBars: rightOffsetBars,
        };
        canvas.style.cursor = "ew-resize";
        return;
      }

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

      draggingRef.current = { active: true, x: event.clientX, y: event.clientY, ts: performance.now() };
      canvas.style.cursor = "grabbing";
    };

    const onMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      setCrosshair({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      if (highlightClickRef.current.pending && highlightClickRef.current.startedInBox) {
        const dx = event.clientX - highlightClickRef.current.startX;
        const dy = event.clientY - highlightClickRef.current.startY;
        const moved = Math.hypot(dx, dy) > 4;
        if (moved) {
          highlightClickRef.current.pending = false;
          draggingRef.current = { active: true, x: event.clientX, y: event.clientY, ts: performance.now() };
          canvas.style.cursor = "grabbing";
        }
      }

      if (rightOffsetDragRef.current?.active) {
        const drag = rightOffsetDragRef.current;
        const dx = event.clientX - drag.x;
        const next = Math.max(
          RIGHT_OFFSET_MIN,
          Math.min(RIGHT_OFFSET_MAX, drag.offsetBars + dx / RIGHT_OFFSET_DRAG_PX_PER_BAR)
        );
        setRightOffsetBars(Math.round(next * 10) / 10);
        canvas.style.cursor = "ew-resize";
        return;
      }

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
      const xGeometry = xGeometryRef.current;
      const isRightGapHover = Boolean(
        xGeometry &&
        event.offsetX >= xGeometry.gapStartX &&
        event.offsetX <= xGeometry.plotEndX &&
        event.offsetY >= xGeometry.plotTopY &&
        event.offsetY <= xGeometry.plotBottomY
      );
      if (!draggingRef.current.active) {
        canvas.style.cursor = isRightGapHover ? "ew-resize" : (isPriceScaleHover ? "ns-resize" : "crosshair");
        return;
      }
      const current = rangeRef.current;
      if (!layout || !current) return;

      const nowTs = performance.now();
      const dx = event.clientX - draggingRef.current.x;
      const dy = event.clientY - draggingRef.current.y;
      const dt = Math.max(1, nowTs - draggingRef.current.ts);
      draggingRef.current = { ...draggingRef.current, x: event.clientX, y: event.clientY, ts: nowTs };
      const visible = current.end - current.start + 1;
      const pxPerMs = Math.abs(dx) / dt;
      const accel = Math.min(PAN_ACCEL_MAX, 1 + pxPerMs * 3.5);
      const shift = Math.round(((-dx / layout.innerWidth) * visible) * PAN_SENSITIVITY * accel);
      const yMeta = yScaleMetaRef.current;
      if (yMeta && dy !== 0) {
        const priceDelta = (dy / yMeta.innerHeight) * yMeta.pRange;
        yScaleAnchorRef.current = null;
        setYCenterPrice((prev) => (prev ?? (yMeta.pTop - yMeta.pRange / 2)) + priceDelta);
      }
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
      if (highlightClickRef.current.pending && highlightClickRef.current.startedInBox) {
        onDeselectSelectedTrade?.();
      }
      highlightClickRef.current.pending = false;
      highlightClickRef.current.startedInBox = false;
      draggingRef.current.active = false;
      if (yScaleDragRef.current) {
        yScaleDragRef.current.active = false;
      }
      if (rightOffsetDragRef.current) {
        rightOffsetDragRef.current.active = false;
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
  }, [appReadyTick, candles.length, rightOffsetBars, yZoom]);

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
    setYCenterPrice(null);
    yScaleAnchorRef.current = null;
    if (candles.length === 0) return;
    const end = candles.length - 1;
    const visible = Math.min(defaultVisibleBars, candles.length);
    setRange({ start: Math.max(0, end - visible + 1), end });
  }

  useEffect(() => {
    if (!focusTimeUtc || candles.length === 0) return;
    if (lastFocusTimeRef.current === focusTimeUtc) return;

    const focusMs = Date.parse(focusTimeUtc);
    if (Number.isNaN(focusMs)) return;

    const targetIdx = candles.findIndex((candle) => {
      const candleMs = Date.parse(candle.time_utc);
      return !Number.isNaN(candleMs) && candleMs >= focusMs;
    });
    if (targetIdx < 0) return;

    const current = rangeRef.current;
    const visible = current ? Math.max(2, current.end - current.start + 1) : Math.min(defaultVisibleBars, candles.length);
    const ratio = 0.5;
    let start = targetIdx - Math.round(visible * ratio);
    let end = start + visible - 1;

    if (start < 0) {
      start = 0;
      end = Math.min(candles.length - 1, visible - 1);
    }
    if (end >= candles.length) {
      end = candles.length - 1;
      start = Math.max(0, end - visible + 1);
    }

    setRange({ start, end });
    lastFocusTimeRef.current = focusTimeUtc;
  }, [candles, defaultVisibleBars, focusTimeUtc]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;

    const draw = async () => {
      const { Graphics, Text, TextStyle } = await import("pixi.js");
      if (!appRef.current) return;

      app.renderer.resize(width, height);
      app.stage.removeChildren();
      selectedHighlightBoxRef.current = null;

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
      if (movingAverageSeries.length > 0) {
        for (const ma of movingAverageSeries) {
          for (let idx = start; idx <= end; idx += 1) {
            const value = ma.values[idx];
            if (typeof value === "number" && Number.isFinite(value)) {
              prices.push(value);
            }
          }
        }
      }
      if (typeof continuationLevel === "number" && Number.isFinite(continuationLevel)) prices.push(continuationLevel);
      if (breakLevel) prices.push(breakLevel.price);
      if (candidateLevels) {
        prices.push(candidateLevels.continuationPrice, candidateLevels.reversalPrice);
      }
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
      if (anchor && yCenterPrice === null) {
        const ratio = Math.max(0, Math.min(1, anchor.ratio));
        pTop = anchor.price + ratio * pRange;
      } else if (yCenterPrice !== null) {
        pTop = yCenterPrice + pRange / 2;
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
      app.stage.addChild(grid);

      for (let i = 0; i <= 5; i += 1) {
        const y = margin.top + (innerHeight * i) / 5;
        const value = pTop - (pRange * i) / 5;
        const label = new Text(value.toFixed(5), baseText);
        label.x = width - margin.right + 4;
        label.y = y - 7;
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

      const visibleCount = Math.max(1, visible.length);
      const plotBars = Math.max(1, visibleCount + rightOffsetBars);
      const slot = innerWidth / plotBars;
      const candleW = Math.max(2, Math.min(10, slot * 0.65));
      const gapStartX = margin.left + visibleCount * slot;
      xGeometryRef.current = {
        slot,
        visibleCount,
        gapStartX,
        plotEndX: margin.left + innerWidth,
        plotTopY: margin.top,
        plotBottomY: height - margin.bottom,
      };

      const xTickCount = 8;
      const tickIndices: number[] = [];
      for (let i = 0; i <= xTickCount; i += 1) {
        const ratio = i / xTickCount;
        const idx = Math.max(0, Math.min(visible.length - 1, Math.floor((visible.length - 1) * ratio)));
        if (tickIndices.length === 0 || tickIndices[tickIndices.length - 1] !== idx) {
          tickIndices.push(idx);
        }
      }

      const xGrid = new Graphics();
      xGrid.lineStyle(1, 0xe2e8f0, 1);
      tickIndices.forEach((idx) => {
        const x = margin.left + idx * slot + slot / 2;
        xGrid.moveTo(x, margin.top);
        xGrid.lineTo(x, height - margin.bottom);
      });
      app.stage.addChild(xGrid);

      tickIndices.forEach((idx) => {
        const x = margin.left + idx * slot + slot / 2;
        const timeLabel = formatXAxisLabel(visible[idx].time_utc, timeframeMin);
        if (!timeLabel) return;
        const label = new Text(timeLabel, baseText);
        label.x = Math.max(margin.left, Math.min(width - margin.right - label.width, x - label.width / 2));
        label.y = height - margin.bottom + 6;
        app.stage.addChild(label);
      });

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
        const visibleLegs = drawableLegs.filter((leg) => leg.drawEndIdx >= start && leg.drawStartIdx <= end);
        visibleLegs.forEach((leg) => {
          const clippedStart = Math.max(start, leg.drawStartIdx);
          const clippedEnd = Math.min(end, leg.drawEndIdx);
          const localStart = clippedStart - start;
          const localEnd = clippedEnd - start;
          const left = margin.left + localStart * slot + slot * 0.1;
          const right = margin.left + (localEnd + 1) * slot - slot * 0.1;
          let segmentHigh = Number.NEGATIVE_INFINITY;
          let segmentLow = Number.POSITIVE_INFINITY;
          for (let i = clippedStart; i <= clippedEnd; i += 1) {
            segmentHigh = Math.max(segmentHigh, candles[i].high);
            segmentLow = Math.min(segmentLow, candles[i].low);
          }
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

      if (selectedTradeHighlight?.start_time) {
        const startMs = Date.parse(selectedTradeHighlight.start_time);
        const endMsRaw = selectedTradeHighlight.end_time
          ? Date.parse(selectedTradeHighlight.end_time)
          : startMs;

        if (!Number.isNaN(startMs) && !Number.isNaN(endMsRaw)) {
          const rangeStartMs = Math.min(startMs, endMsRaw);
          const rangeEndMs = Math.max(startMs, endMsRaw);

          const startIdx = visible.findIndex((candle) => Date.parse(candle.time_utc) >= rangeStartMs);
          const endIdx = visible.findIndex((candle) => Date.parse(candle.time_utc) >= rangeEndMs);

          if (startIdx >= 0) {
            const resolvedEndIdx = endIdx >= 0 ? endIdx : visible.length - 1;
            const leftIdx = Math.max(0, Math.min(startIdx, resolvedEndIdx));
            const rightIdx = Math.max(leftIdx, Math.min(visible.length - 1, resolvedEndIdx));

            let high = Number.NEGATIVE_INFINITY;
            let low = Number.POSITIVE_INFINITY;
            for (let i = leftIdx; i <= rightIdx; i += 1) {
              high = Math.max(high, visible[i].high);
              low = Math.min(low, visible[i].low);
            }
            if (typeof selectedTradeHighlight.entry === "number") {
              high = Math.max(high, selectedTradeHighlight.entry);
              low = Math.min(low, selectedTradeHighlight.entry);
            }
            if (typeof selectedTradeHighlight.exit === "number") {
              high = Math.max(high, selectedTradeHighlight.exit);
              low = Math.min(low, selectedTradeHighlight.exit);
            }

            if (Number.isFinite(high) && Number.isFinite(low)) {
              const bullish = selectedTradeHighlight.side === "buy";
              const color = bullish ? 0x0f766e : 0xb91c1c;
              const boxX = margin.left + leftIdx * slot;
              const boxW = Math.max(slot, (rightIdx - leftIdx + 1) * slot);
              const boxTop = toY(high);
              const boxBottom = toY(low);
              const boxY = Math.min(boxTop, boxBottom);
              const boxH = Math.max(12, Math.abs(boxBottom - boxTop));

              const highlight = new Graphics();
              highlight.lineStyle(1.2, color, 0.95);
              highlight.beginFill(color, 0.14);
              highlight.drawRoundedRect(boxX, boxY, boxW, boxH, 4);
              highlight.endFill();
              app.stage.addChild(highlight);
              selectedHighlightBoxRef.current = { x: boxX, y: boxY, w: boxW, h: boxH };
            }
          }
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

      if (movingAverageSeries.length > 0) {
        movingAverageSeries.forEach((ma, idx) => {
          const fallbackColor = ma.kind === "ema" ? 0xf59e0b : 0x2563eb;
          const lineColor = parseHexColor(ma.color, fallbackColor);
          const maLine = new Graphics();
          maLine.lineStyle(1.5, lineColor, 0.95);

          let drawing = false;
          for (let localIdx = 0; localIdx < visible.length; localIdx += 1) {
            const globalIdx = start + localIdx;
            const value = ma.values[globalIdx];
            if (typeof value !== "number" || !Number.isFinite(value)) {
              drawing = false;
              continue;
            }

            const x = margin.left + localIdx * slot + slot / 2;
            const y = toY(value);
            if (!drawing) {
              maLine.moveTo(x, y);
              drawing = true;
            } else {
              maLine.lineTo(x, y);
            }
          }
          app.stage.addChild(maLine);

          const legend = new Text(ma.label, new TextStyle({
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 10,
            fill: lineColor,
            fontWeight: "600",
          }));
          legend.x = margin.left + idx * 78;
          legend.y = margin.top + 2;
          app.stage.addChild(legend);
        });
      }

      if (tradeMarkers.length > 0) {
        const visibleStartMs = Date.parse(visible[0].time_utc);
        const visibleEndMs = Date.parse(visible[visible.length - 1].time_utc);
        const markerStyle = {
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: 10,
          fontWeight: "700",
        } as const;

        tradeMarkers.forEach((marker) => {
          const markerMs = Date.parse(marker.time_utc);
          if (Number.isNaN(markerMs)) return;
          if (markerMs < visibleStartMs || markerMs > visibleEndMs) return;

          const localIdx = visible.findIndex((candle) => Date.parse(candle.time_utc) >= markerMs);
          if (localIdx < 0) return;

          const x = margin.left + localIdx * slot + slot / 2;
          const y = toY(marker.price);
          const bullish = marker.side === "buy";
          const resultText = String(marker.result ?? "").toUpperCase();
          const isProfit = marker.pnl_points !== undefined
            ? marker.pnl_points > 0
            : resultText.includes("TP") || resultText.includes("PROFIT") || resultText === "WIN";
          const isLoss = marker.pnl_points !== undefined
            ? marker.pnl_points < 0
            : resultText.includes("SL") || resultText.includes("LOSS");

          const baseColor = marker.kind === "exit"
            ? isProfit
              ? 0x0f766e
              : isLoss
                ? 0xb91c1c
                : 0x475569
            : bullish
              ? 0x0f766e
              : 0xb91c1c;
          const labelText = marker.kind === "exit"
            ? isProfit
              ? "P"
              : isLoss
                ? "L"
                : "X"
            : bullish
              ? "B"
              : "S";

          const dot = new Graphics();
          dot.lineStyle(1.5, 0xffffff, 1);
          dot.beginFill(baseColor, 0.95);
          dot.drawCircle(x, y, 5);
          dot.endFill();
          app.stage.addChild(dot);

          const label = new Text(labelText, new TextStyle({ ...markerStyle, fill: 0xffffff }));
          label.x = x - label.width / 2;
          label.y = y - label.height / 2 - 0.5;
          app.stage.addChild(label);
        });
      }

      const currentPrice = effectiveLivePrice ?? visible[visible.length - 1]?.close;
      if (typeof currentPrice === "number" && Number.isFinite(currentPrice)) {
        const lastCandle = visible[visible.length - 1];
        const currentPriceColor = lastCandle && lastCandle.close >= lastCandle.open ? 0x26a69a : 0xef5350;
        const y = toY(currentPrice);
        const currentLine = new Graphics();
        currentLine.lineStyle(1, currentPriceColor, 0.8);
        const segment = 3;
        const gap = 4;
        for (let x = margin.left; x < width - margin.right; x += segment + gap) {
          const x2 = Math.min(width - margin.right, x + segment);
          currentLine.moveTo(x, y);
          currentLine.lineTo(x2, y);
        }
        app.stage.addChild(currentLine);

        const tag = new Text(currentPrice.toFixed(5), new TextStyle({
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: 10,
          fill: 0xffffff,
          fontWeight: "700",
        }));
        const tagPadX = 4;
        const tagPadY = 2;
        const boxX = width - margin.right + 2;
        const boxY = Math.max(margin.top, Math.min(height - margin.bottom - (tag.height + tagPadY * 2), y - (tag.height + tagPadY * 2) / 2));
        const tagBox = new Graphics();
        tagBox.beginFill(currentPriceColor, 1);
        tagBox.drawRoundedRect(boxX, boxY, tag.width + tagPadX * 2, tag.height + tagPadY * 2, 3);
        tagBox.endFill();
        app.stage.addChild(tagBox);
        tag.x = boxX + tagPadX;
        tag.y = boxY + tagPadY;
        app.stage.addChild(tag);
      }

      if (crosshair) {
        const inX = crosshair.x >= margin.left && crosshair.x <= width - margin.right;
        const inY = crosshair.y >= margin.top && crosshair.y <= height - margin.bottom;
        if (inX && inY) {
          const ch = new Graphics();
          ch.lineStyle(0.8, 0xcbd5e1, 0.95);
          const dash = 3;
          const gap = 4;
          for (let y = margin.top; y < height - margin.bottom; y += dash + gap) {
            const y2 = Math.min(height - margin.bottom, y + dash);
            ch.moveTo(crosshair.x, y);
            ch.lineTo(crosshair.x, y2);
          }
          for (let x = margin.left; x < width - margin.right; x += dash + gap) {
            const x2 = Math.min(width - margin.right, x + dash);
            ch.moveTo(x, crosshair.y);
            ch.lineTo(x2, crosshair.y);
          }
          app.stage.addChild(ch);

          const yRatio = Math.max(0, Math.min(1, (crosshair.y - margin.top) / innerHeight));
          const yPrice = pTop - yRatio * pRange;
          const yLabel = new Text(yPrice.toFixed(5), new TextStyle({
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontSize: 10,
            fill: 0xffffff,
            fontWeight: "700",
          }));
          const yPadX = 4;
          const yPadY = 2;
          const yBoxX = width - margin.right + 2;
          const yBoxY = Math.max(
            margin.top,
            Math.min(height - margin.bottom - (yLabel.height + yPadY * 2), crosshair.y - (yLabel.height + yPadY * 2) / 2)
          );
          const yBox = new Graphics();
          yBox.beginFill(0x1f2937, 0.96);
          yBox.drawRoundedRect(yBoxX, yBoxY, yLabel.width + yPadX * 2, yLabel.height + yPadY * 2, 3);
          yBox.endFill();
          app.stage.addChild(yBox);
          yLabel.x = yBoxX + yPadX;
          yLabel.y = yBoxY + yPadY;
          app.stage.addChild(yLabel);

          const localIdx = Math.max(0, Math.min(visible.length - 1, Math.floor((crosshair.x - margin.left) / slot)));
          const timeLabel = formatXAxisLabel(visible[localIdx]?.time_utc ?? "", timeframeMin);
          if (timeLabel) {
            const xLabel = new Text(timeLabel, new TextStyle({
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 10,
              fill: 0xffffff,
              fontWeight: "700",
            }));
            const xPadX = 5;
            const xPadY = 2;
            const xBoxW = xLabel.width + xPadX * 2;
            const xBoxH = xLabel.height + xPadY * 2;
            const xBoxX = Math.max(
              margin.left,
              Math.min(width - margin.right - xBoxW, crosshair.x - xBoxW / 2)
            );
            const xBoxY = height - margin.bottom + 6;
            const xBox = new Graphics();
            xBox.beginFill(0x1f2937, 0.96);
            xBox.drawRoundedRect(xBoxX, xBoxY, xBoxW, xBoxH, 3);
            xBox.endFill();
            app.stage.addChild(xBox);
            xLabel.x = xBoxX + xPadX;
            xLabel.y = xBoxY + xPadY;
            app.stage.addChild(xLabel);
          }
        }
      }
    };

    void draw();
  }, [appReadyTick, breakLevel, candles, candidateLevels, continuationLevel, crosshair, drawableLegs, effectiveLivePrice, height, liveBoundaryIso, movingAverageSeries, range, rightOffsetBars, selectedTradeHighlight, timeframeMin, tradeMarkers, width, yCenterPrice, yZoom]);

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
          {(range ? range.end - range.start + 1 : candles.length)}/{candles.length} bars | Ctrl+wheel zoom X | drag pan X/Y | drag right gap X | drag right scale zoom Y
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








