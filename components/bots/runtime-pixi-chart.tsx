"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BotRuntimeH4Candle } from "@/lib/types";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useRuntimeChartData, type RuntimeChartCandle } from "@/hooks/use-runtime-chart-data";

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
  onLegBoxClick?: (leg: LegClickPayload) => void;
  focusTimeUtc?: string | null;
  focusRangeUtc?: FocusRangeUtc | null;
  movingAverages?: RuntimeMovingAverageConfig[];
  dataMode?: "live" | "historical";
  useWebSocket?: boolean;
};

type Candle = RuntimeChartCandle;

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
  entry_price?: number;
  entry_time_utc?: string;
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

type FocusRangeUtc = {
  startTimeUtc: string;
  endExclusiveTimeUtc: string;
};

type LegClickPayload = {
  legId: number;
  direction: "bull" | "bear";
  startTimeUtc: string;
  endTimeUtc: string;
  endExclusiveTimeUtc: string;
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

function findCandleIndexForTime(candles: Candle[], targetMs: number) {
  if (candles.length === 0 || Number.isNaN(targetMs)) return -1;
  const times = candles.map((candle) => Date.parse(candle.time_utc));
  if (times.some((time) => Number.isNaN(time))) return -1;

  const idx = lowerBound(times, targetMs);
  if (idx <= 0) return 0;
  if (idx >= times.length) return times.length - 1;

  const currentStart = times[idx];
  if (currentStart === targetMs) return idx;

  const prevStart = times[idx - 1];
  if (prevStart <= targetMs && targetMs < currentStart) return idx - 1;

  // Fallback to the closest start timestamp if the series has irregular gaps.
  return Math.abs(targetMs - prevStart) <= Math.abs(currentStart - targetMs) ? idx - 1 : idx;
}

function normalizeSymbolKey(value: string | undefined | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
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
  onLegBoxClick,
  focusTimeUtc = null,
  focusRangeUtc = null,
  movingAverages = [],
  dataMode = "live",
  useWebSocket = true,
}: Props) {
  const DEFAULT_VISIBLE_BARS_BASE = 20;
  const ZOOM_IN_FACTOR = 0.84;
  const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;
  const PAN_SENSITIVITY = 1.0;
  const Y_ZOOM_STEP = 0.008;
  const Y_ZOOM_EPSILON = 1e-9;
  const RIGHT_OFFSET_DEFAULT = 2.5;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<import("pixi.js").Application | null>(null);
  const drawLayoutRef = useRef<DrawLayout | null>(null);
  const xGeometryRef = useRef<XGeometry | null>(null);
  const rangeRef = useRef<{ start: number; end: number } | null>(null);
  const draggingRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originRange: { start: number; end: number } | null;
    originCenterPrice: number | null;
  }>({ active: false, startX: 0, startY: 0, originRange: null, originCenterPrice: null });
  const yScaleDragRef = useRef<{ active: boolean; y: number; zoom: number; centerPrice: number } | null>(null);
  const yScaleAnchorRef = useRef<{ ratio: number; price: number } | null>(null);
  const yScaleMetaRef = useRef<{ pTop: number; pRange: number; marginTop: number; innerHeight: number } | null>(null);
  const userInteractedRef = useRef(false);
  const appliedOverlaySnapshotRef = useRef<string>("");
  const lastFocusTimeRef = useRef<string>("");
  const lastFocusRangeRef = useRef<string>("");
  const yCenterPriceRef = useRef<number | null>(null);
  const yZoomRef = useRef(1);
  const interactionRafRef = useRef<number | null>(null);
  const pendingRangeRef = useRef<{ start: number; end: number } | null>(null);
  const pendingYCenterPriceRef = useRef<number | null>(null);
  const pendingYZoomRef = useRef<number | null>(null);
  const pendingCrosshairRef = useRef<{ pending: boolean; value: { x: number; y: number } | null }>({
    pending: false,
    value: null,
  });
  const selectedHighlightBoxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const clickableLegBoxesRef = useRef<Array<{ x: number; y: number; w: number; h: number; leg: LegClickPayload }>>([]);
  const highlightClickRef = useRef<{
    pending: boolean;
    startX: number;
    startY: number;
    startedInSelectedBox: boolean;
    startedInLegBox: LegClickPayload | null;
  }>({ pending: false, startX: 0, startY: 0, startedInSelectedBox: false, startedInLegBox: null });

  const [width, setWidth] = useState(900);
  const [appReadyTick, setAppReadyTick] = useState(0);
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
  const {
    candles,
    wsTicks,
    liveBoundaryIso,
    effectiveLivePrice,
    isHistorical,
  } = useRuntimeChartData({
    symbol,
    timeframeLabel,
    normalizedFallback,
    fallbackSignature,
    defaultVisibleBars,
    dataMode,
    useWebSocket,
    livePrice,
    liveTimestamp,
  });
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
  const yAutoDomain = useMemo(() => {
    const prices: number[] = [];
    for (const candle of candles) {
      prices.push(candle.low, candle.high);
    }
    for (const ma of movingAverageSeries) {
      for (const value of ma.values) {
        if (typeof value === "number" && Number.isFinite(value)) {
          prices.push(value);
        }
      }
    }
    if (typeof continuationLevel === "number" && Number.isFinite(continuationLevel)) {
      prices.push(continuationLevel);
    }
    if (breakLevel) {
      prices.push(breakLevel.price);
    }
    if (candidateLevels) {
      prices.push(candidateLevels.continuationPrice, candidateLevels.reversalPrice);
    }

    if (prices.length === 0) {
      return { baseTop: 1, baseBottom: 0, baseRange: 1 };
    }

    const max = Math.max(...prices);
    const min = Math.min(...prices);
    const baseRange = Math.max(max - min, 0.00002);
    const basePad = Math.max(baseRange * 0.1, 0.00002);
    const baseTop = max + basePad;
    const baseBottom = min - basePad;
    return { baseTop, baseBottom, baseRange: Math.max(baseTop - baseBottom, 0.00002) };
  }, [breakLevel, candidateLevels, candles, continuationLevel, movingAverageSeries]);

  useEffect(() => {
    rangeRef.current = range;
  }, [range]);

  useEffect(() => {
    yCenterPriceRef.current = yCenterPrice;
  }, [yCenterPrice]);

  useEffect(() => {
    yZoomRef.current = yZoom;
  }, [yZoom]);

  useEffect(() => {
    userInteractedRef.current = false;
    setRange(null);
    setYZoom(1);
    setYCenterPrice(null);
    yScaleAnchorRef.current = null;
    appliedOverlaySnapshotRef.current = "";
    lastFocusTimeRef.current = "";
    lastFocusRangeRef.current = "";
    pendingRangeRef.current = null;
    pendingYCenterPriceRef.current = null;
    pendingYZoomRef.current = null;
    pendingCrosshairRef.current.pending = false;
    pendingCrosshairRef.current.value = null;
  }, [dataMode, symbol, timeframeLabel]);

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
    const app = appRef.current;
    if (!app) return;
    const canvas = app.view as HTMLCanvasElement;

    const applyPendingInteraction = () => {
      interactionRafRef.current = null;

      if (pendingCrosshairRef.current.pending) {
        setCrosshair(pendingCrosshairRef.current.value);
        pendingCrosshairRef.current.pending = false;
      }

      if (pendingYZoomRef.current !== null) {
        const nextZoom = pendingYZoomRef.current;
        pendingYZoomRef.current = null;
        setYZoom((prev) => (Math.abs(prev - nextZoom) < 1e-9 ? prev : nextZoom));
      }

      if (pendingYCenterPriceRef.current !== null) {
        const nextCenter = pendingYCenterPriceRef.current;
        pendingYCenterPriceRef.current = null;
        setYCenterPrice((prev) => (prev !== null && Math.abs(prev - nextCenter) < 1e-9 ? prev : nextCenter));
      }

      if (pendingRangeRef.current) {
        const next = pendingRangeRef.current;
        pendingRangeRef.current = null;
        setRange((current) => {
          if (current && current.start === next.start && current.end === next.end) return current;
          return next;
        });
      }
    };

    const scheduleInteractionFlush = () => {
      if (interactionRafRef.current !== null) return;
      interactionRafRef.current = requestAnimationFrame(applyPendingInteraction);
    };

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
      const startedInSelectedBox = Boolean(
        activeBox &&
        event.offsetX >= activeBox.x &&
        event.offsetX <= activeBox.x + activeBox.w &&
        event.offsetY >= activeBox.y &&
        event.offsetY <= activeBox.y + activeBox.h
      );
      const startedInLegBox = clickableLegBoxesRef.current.find((item) =>
        event.offsetX >= item.x &&
        event.offsetX <= item.x + item.w &&
        event.offsetY >= item.y &&
        event.offsetY <= item.y + item.h
      )?.leg ?? null;
      highlightClickRef.current = {
        pending: true,
        startX: event.clientX,
        startY: event.clientY,
        startedInSelectedBox,
        startedInLegBox,
      };
      if (startedInSelectedBox || startedInLegBox) {
        canvas.style.cursor = "pointer";
        return;
      }

      const layout = drawLayoutRef.current;

      const inLeftScale = Boolean(layout && event.offsetX <= layout.marginLeft);
      const inRightScale = Boolean(layout && event.offsetX >= layout.marginLeft + layout.innerWidth);
      const inVerticalScale = inLeftScale || inRightScale;
      if (inVerticalScale) {
        const yMeta = yScaleMetaRef.current;
        if (yMeta) {
          const centerPrice = yCenterPriceRef.current ?? (yMeta.pTop - yMeta.pRange / 2);
          yScaleDragRef.current = {
            active: true,
            y: event.clientY,
            zoom: yZoomRef.current,
            centerPrice,
          };
          yScaleAnchorRef.current = null;
          pendingYCenterPriceRef.current = centerPrice;
          canvas.style.cursor = "ns-resize";
          return;
        }
      }

      const originRange = rangeRef.current;
      const yMeta = yScaleMetaRef.current;
      const originCenter = yCenterPriceRef.current ?? (yMeta ? (yMeta.pTop - yMeta.pRange / 2) : null);
      draggingRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        originRange: originRange ? { ...originRange } : null,
        originCenterPrice: originCenter,
      };
      canvas.style.cursor = "grabbing";
    };

    const onMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pendingCrosshairRef.current.pending = true;
      pendingCrosshairRef.current.value = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      scheduleInteractionFlush();
      if (
        highlightClickRef.current.pending &&
        (highlightClickRef.current.startedInSelectedBox || highlightClickRef.current.startedInLegBox)
      ) {
        const dx = event.clientX - highlightClickRef.current.startX;
        const dy = event.clientY - highlightClickRef.current.startY;
        const moved = Math.hypot(dx, dy) > 4;
        if (moved) {
          highlightClickRef.current.pending = false;
          const originRange = rangeRef.current;
          const yMeta = yScaleMetaRef.current;
          const originCenter = yCenterPriceRef.current ?? (yMeta ? (yMeta.pTop - yMeta.pRange / 2) : null);
          draggingRef.current = {
            active: true,
            startX: event.clientX,
            startY: event.clientY,
            originRange: originRange ? { ...originRange } : null,
            originCenterPrice: originCenter,
          };
          canvas.style.cursor = "grabbing";
        }
      }

      if (yScaleDragRef.current?.active) {
        const scale = yScaleDragRef.current;
        const dy = event.clientY - scale.y;
        const factor = Math.exp(-dy * Y_ZOOM_STEP);
        const nextZoom = Math.max(Y_ZOOM_EPSILON, scale.zoom * factor);
        yScaleAnchorRef.current = null;
        pendingYCenterPriceRef.current = scale.centerPrice;
        pendingYZoomRef.current = nextZoom;
        scheduleInteractionFlush();
        canvas.style.cursor = "ns-resize";
        return;
      }

      const layout = drawLayoutRef.current;
      const isPriceScaleHover = Boolean(
        layout && (event.offsetX <= layout.marginLeft || event.offsetX >= layout.marginLeft + layout.innerWidth)
      );
      const activeBox = selectedHighlightBoxRef.current;
      const isSelectedBoxHover = Boolean(
        activeBox &&
        event.offsetX >= activeBox.x &&
        event.offsetX <= activeBox.x + activeBox.w &&
        event.offsetY >= activeBox.y &&
        event.offsetY <= activeBox.y + activeBox.h
      );
      const isLegBoxHover = clickableLegBoxesRef.current.some((item) =>
        event.offsetX >= item.x &&
        event.offsetX <= item.x + item.w &&
        event.offsetY >= item.y &&
        event.offsetY <= item.y + item.h
      );
      if (!draggingRef.current.active) {
        canvas.style.cursor = isSelectedBoxHover || isLegBoxHover
          ? "pointer"
          : (isPriceScaleHover ? "ns-resize" : "crosshair");
        return;
      }
      const current = draggingRef.current.originRange ?? pendingRangeRef.current ?? rangeRef.current;
      if (!layout || !current) return;

      const dx = event.clientX - draggingRef.current.startX;
      const dy = event.clientY - draggingRef.current.startY;
      const visible = current.end - current.start + 1;
      const shift = Math.round(((-dx / layout.innerWidth) * visible) * PAN_SENSITIVITY);
      const yMeta = yScaleMetaRef.current;
      if (yMeta && dy !== 0) {
        const priceDelta = (dy / yMeta.innerHeight) * yMeta.pRange;
        yScaleAnchorRef.current = null;
        const originCenter = draggingRef.current.originCenterPrice ?? (yMeta.pTop - yMeta.pRange / 2);
        pendingYCenterPriceRef.current = originCenter + priceDelta;
      }
      if (shift === 0) {
        scheduleInteractionFlush();
        return;
      }

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
      pendingRangeRef.current = { start, end };
      scheduleInteractionFlush();
    };

    const onMouseUp = () => {
      if (interactionRafRef.current !== null) {
        cancelAnimationFrame(interactionRafRef.current);
        interactionRafRef.current = null;
      }
      applyPendingInteraction();
      if (highlightClickRef.current.pending && highlightClickRef.current.startedInSelectedBox) {
        onDeselectSelectedTrade?.();
      }
      if (highlightClickRef.current.pending && highlightClickRef.current.startedInLegBox) {
        onLegBoxClick?.(highlightClickRef.current.startedInLegBox);
      }
      highlightClickRef.current.pending = false;
      highlightClickRef.current.startedInSelectedBox = false;
      highlightClickRef.current.startedInLegBox = null;
      draggingRef.current.active = false;
      draggingRef.current.originRange = null;
      draggingRef.current.originCenterPrice = null;
      if (yScaleDragRef.current) {
        yScaleDragRef.current.active = false;
      }
      canvas.style.cursor = "crosshair";
    };
    const onMouseLeave = () => {
      pendingCrosshairRef.current.pending = true;
      pendingCrosshairRef.current.value = null;
      scheduleInteractionFlush();
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
      if (interactionRafRef.current !== null) {
        cancelAnimationFrame(interactionRafRef.current);
        interactionRafRef.current = null;
      }
    };
  }, [appReadyTick, candles.length, onDeselectSelectedTrade, onLegBoxClick]);

  function zoomByFactor(factor: number) {
    const current = rangeRef.current;
    if (!current || candles.length <= 2) return;
    userInteractedRef.current = true;
    pendingRangeRef.current = null;
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
    pendingRangeRef.current = null;
    pendingYCenterPriceRef.current = null;
    pendingYZoomRef.current = null;
    setYZoom(1);
    setYCenterPrice(null);
    yScaleAnchorRef.current = null;
    if (candles.length === 0) return;
    const end = candles.length - 1;
    const visible = Math.min(defaultVisibleBars, candles.length);
    setRange({ start: Math.max(0, end - visible + 1), end });
  }

  function centerChart() {
    // Center only Y axis based on currently visible candles; keep X range and zoom untouched.
    if (candles.length === 0) return;
    const current = rangeRef.current;
    const start = current ? Math.max(0, Math.min(current.start, candles.length - 1)) : 0;
    const end = current ? Math.max(start, Math.min(current.end, candles.length - 1)) : (candles.length - 1);

    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    for (let idx = start; idx <= end; idx += 1) {
      high = Math.max(high, candles[idx].high);
      low = Math.min(low, candles[idx].low);
    }
    if (!Number.isFinite(high) || !Number.isFinite(low)) return;

    pendingYCenterPriceRef.current = null;
    yScaleAnchorRef.current = null;
    setYCenterPrice((high + low) / 2);
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
    if (!focusRangeUtc || candles.length === 0) return;
    const signature = `${focusRangeUtc.startTimeUtc}|${focusRangeUtc.endExclusiveTimeUtc}`;
    if (lastFocusRangeRef.current === signature) return;

    const startMs = Date.parse(focusRangeUtc.startTimeUtc);
    const endExclusiveMs = Date.parse(focusRangeUtc.endExclusiveTimeUtc);
    if (Number.isNaN(startMs) || Number.isNaN(endExclusiveMs)) return;
    if (endExclusiveMs <= startMs) return;

    const startIdx = candles.findIndex((candle) => {
      const candleMs = Date.parse(candle.time_utc);
      return !Number.isNaN(candleMs) && candleMs >= startMs;
    });
    if (startIdx < 0) return;

    let endIdx = -1;
    for (let idx = startIdx; idx < candles.length; idx += 1) {
      const candleMs = Date.parse(candles[idx].time_utc);
      if (Number.isNaN(candleMs)) continue;
      if (candleMs < endExclusiveMs) {
        endIdx = idx;
      } else {
        break;
      }
    }
    if (endIdx < startIdx) endIdx = startIdx;

    const segment = endIdx - startIdx + 1;
    const pad = Math.max(2, Math.ceil(segment * 0.25));
    let nextStart = Math.max(0, startIdx - pad);
    let nextEnd = Math.min(candles.length - 1, endIdx + pad);

    if (nextEnd - nextStart < segment) {
      nextEnd = Math.min(candles.length - 1, nextStart + segment - 1);
      nextStart = Math.max(0, nextEnd - segment + 1);
    }

    userInteractedRef.current = true;
    setRange({ start: nextStart, end: nextEnd });
    let segmentHigh = Number.NEGATIVE_INFINITY;
    let segmentLow = Number.POSITIVE_INFINITY;
    for (let idx = startIdx; idx <= endIdx; idx += 1) {
      segmentHigh = Math.max(segmentHigh, candles[idx].high);
      segmentLow = Math.min(segmentLow, candles[idx].low);
    }
    if (Number.isFinite(segmentHigh) && Number.isFinite(segmentLow)) {
      pendingYCenterPriceRef.current = null;
      yScaleAnchorRef.current = null;
      setYCenterPrice((segmentHigh + segmentLow) / 2);
    }
    lastFocusRangeRef.current = signature;
  }, [candles, focusRangeUtc]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;

    const draw = async () => {
      const { Graphics, Text, TextStyle } = await import("pixi.js");
      if (!appRef.current) return;

      app.renderer.resize(width, height);
      app.stage.removeChildren();
      selectedHighlightBoxRef.current = null;
      clickableLegBoxesRef.current = [];

      const margin = { left: 6, right: 58, top: 12, bottom: 26 };
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
        const t = new Text(isHistorical ? "No historical candles loaded." : "Waiting WS ticks...", baseText);
        t.x = margin.left;
        t.y = margin.top + innerHeight / 2;
        app.stage.addChild(t);
        return;
      }

      const start = Math.max(0, Math.min(range.start, candles.length - 1));
      const end = Math.max(start, Math.min(range.end, candles.length - 1));
      const visible = candles.slice(start, end + 1);
      const candleTimes = candles.map((candle) => Date.parse(candle.time_utc));

      drawLayoutRef.current = {
        marginLeft: margin.left,
        marginRight: margin.right,
        marginTop: margin.top,
        marginBottom: margin.bottom,
        innerWidth,
        innerHeight,
      };

      const baseTop = yAutoDomain.baseTop;
      const baseBottom = yAutoDomain.baseBottom;
      const basePRange = yAutoDomain.baseRange;

      const effectiveYZoom = Math.max(Y_ZOOM_EPSILON, yZoom);
      const pRange = Math.max(basePRange / effectiveYZoom, Number.EPSILON);
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
          const fullStartIdx = Math.max(0, Math.min(candles.length - 1, leg.drawStartIdx));
          const fullEndIdx = Math.max(fullStartIdx, Math.min(candles.length - 1, leg.drawEndIdx));
          const drawStartIdx = Math.max(start, fullStartIdx);
          const drawEndIdx = Math.min(end, fullEndIdx);
          const localStart = drawStartIdx - start;
          const localEnd = drawEndIdx - start;
          const left = margin.left + localStart * slot;
          const right = margin.left + (localEnd + 1) * slot;
          let segmentHigh = Number.NEGATIVE_INFINITY;
          let segmentLow = Number.POSITIVE_INFINITY;
          for (let i = drawStartIdx; i <= drawEndIdx; i += 1) {
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

          const startCandle = candles[fullStartIdx];
          const endCandle = candles[fullEndIdx];
          if (startCandle && endCandle) {
            const endMs = Date.parse(endCandle.time_utc);
            const endExclusiveMs = Number.isNaN(endMs)
              ? NaN
              : endMs + Math.max(1, timeframeMin) * 60_000;
            clickableLegBoxesRef.current.push({
              x: left,
              y: top,
              w: widthPx,
              h: heightPx,
              leg: {
                legId: leg.legId,
                direction: leg.direction,
                startTimeUtc: startCandle.time_utc,
                endTimeUtc: endCandle.time_utc,
                endExclusiveTimeUtc: Number.isNaN(endExclusiveMs)
                  ? endCandle.time_utc
                  : new Date(endExclusiveMs).toISOString(),
              },
            });
          }

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
          const endExclusiveMs = rangeEndMs + Math.max(1, timeframeMin) * 60_000;

          const startIdxAbs = Math.max(0, Math.min(candles.length - 1, lowerBound(candleTimes, rangeStartMs)));
          const endIdxAbsRaw = lowerBound(candleTimes, endExclusiveMs) - 1;
          const endIdxAbs = Math.max(startIdxAbs, Math.min(candles.length - 1, endIdxAbsRaw));

          if (endIdxAbs >= start && startIdxAbs <= end) {
            let high = Number.NEGATIVE_INFINITY;
            let low = Number.POSITIVE_INFINITY;
            for (let i = startIdxAbs; i <= endIdxAbs; i += 1) {
              high = Math.max(high, candles[i].high);
              low = Math.min(low, candles[i].low);
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
              const drawStartIdx = Math.max(start, startIdxAbs);
              const drawEndIdx = Math.min(end, endIdxAbs);
              const leftIdx = drawStartIdx - start;
              const rightIdx = drawEndIdx - start;
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

          const absoluteIdx = findCandleIndexForTime(candles, markerMs);
          if (absoluteIdx < 0 || absoluteIdx < start || absoluteIdx > end) return;
          const localIdx = absoluteIdx - start;
          const candleAtIdx = visible[localIdx];
          if (!candleAtIdx) return;

          const x = margin.left + localIdx * slot + slot / 2;
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
              : marker.side === "sell"
                ? 0xb91c1c
                : 0x475569;

          if (marker.kind === "entry") {
            const entryPadding = 14;
            const arrowHalf = 6;
            const arrowHeight = 8;
            const isSell = marker.side === "sell";
            const anchorY = isSell
              ? toY(candleAtIdx.high) - entryPadding
              : toY(candleAtIdx.low) + entryPadding;
            const tipY = isSell ? anchorY + arrowHeight : anchorY - arrowHeight;
            const baseY = anchorY;

            const arrow = new Graphics();
            arrow.lineStyle(1.2, 0xffffff, 0.95);
            arrow.beginFill(baseColor, 0.96);
            arrow.moveTo(x, tipY);
            arrow.lineTo(x - arrowHalf, baseY);
            arrow.lineTo(x + arrowHalf, baseY);
            arrow.lineTo(x, tipY);
            arrow.endFill();
            app.stage.addChild(arrow);
            return;
          }

          const y = toY(marker.price);
          if (marker.kind === "exit") {
            const tickHalf = Math.max(5, candleW * 0.95);
            const tick = new Graphics();
            tick.lineStyle(2, baseColor, 0.98);
            tick.moveTo(x - tickHalf, y);
            tick.lineTo(x + tickHalf, y);
            app.stage.addChild(tick);

            if (typeof marker.entry_price === "number" && Number.isFinite(marker.entry_price)) {
              const entryTimeMs = marker.entry_time_utc ? Date.parse(marker.entry_time_utc) : NaN;
              const entryIdxAbs = Number.isNaN(entryTimeMs) ? -1 : findCandleIndexForTime(candles, entryTimeMs);
              if (entryIdxAbs >= start && entryIdxAbs <= end) {
                const entryLocalIdx = entryIdxAbs - start;
                const entryX = margin.left + entryLocalIdx * slot + slot / 2;
                const yEntry = toY(marker.entry_price);
                const entryTickHalf = Math.max(4, candleW * 0.8);
                const entryTick = new Graphics();
                entryTick.lineStyle(1.6, 0x64748b, 0.95);
                entryTick.moveTo(entryX - entryTickHalf, yEntry);
                entryTick.lineTo(entryX + entryTickHalf, yEntry);
                app.stage.addChild(entryTick);
              }
            }

            const gap = 12;
            const tradeWasBuy = marker.side === "buy";
            const iconY = tradeWasBuy
              ? toY(candleAtIdx.high) - gap
              : toY(candleAtIdx.low) + gap;
            const exitIcon = isProfit ? "√" : isLoss ? "×" : "•";
            const exitLabel = new Text(exitIcon, new TextStyle({
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 14,
              fill: baseColor,
              fontWeight: "700",
            }));
            exitLabel.x = x - exitLabel.width / 2;
            exitLabel.y = iconY - exitLabel.height / 2;
            app.stage.addChild(exitLabel);
            return;
          }
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
          const localIdx = Math.max(0, Math.min(visible.length - 1, Math.floor((crosshair.x - margin.left) / slot)));
          const hovered = visible[localIdx];

          if (hovered) {
            const ohlcBaseStyle = new TextStyle({
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 11,
              fill: 0x94a3b8,
              fontWeight: "300",
            });
            const candleUp = hovered.close >= hovered.open;
            const ohlcNumberStyle = new TextStyle({
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 11,
              fill: candleUp ? 0x0f766e : 0xb91c1c,
              fontWeight: "500",
            });

            const ohlcPairs: Array<[string, number]> = [
              ["O", hovered.open],
              ["H", hovered.high],
              ["L", hovered.low],
              ["C", hovered.close],
            ];
            let ohlcCursorX = margin.left + 22;
            const ohlcY = margin.top + 4;
            for (const [label, value] of ohlcPairs) {
              const labelText = new Text(label, ohlcBaseStyle);
              labelText.x = ohlcCursorX;
              labelText.y = ohlcY;
              app.stage.addChild(labelText);

              const valueText = new Text(value.toFixed(5), ohlcNumberStyle);
              valueText.x = labelText.x + labelText.width + 4;
              valueText.y = ohlcY;
              app.stage.addChild(valueText);

              ohlcCursorX = valueText.x + valueText.width + 12;
            }

            const delta = hovered.close - hovered.open;
            const deltaPct = hovered.open !== 0 ? (delta / hovered.open) * 100 : 0;
            const range = hovered.high - hovered.low;
            const rangePct = hovered.open !== 0 ? (range / hovered.open) * 100 : 0;
            const deltaPositive = delta >= 0;
            const deltaStyle = new TextStyle({
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 11,
              fill: deltaPositive ? 0x0f766e : 0xb91c1c,
              fontWeight: "500",
            });
            const deltaText = `${deltaPositive ? "+" : ""}${delta.toFixed(5)} (${deltaPositive ? "+" : ""}${deltaPct.toFixed(2)}%) | H-L ${rangePct.toFixed(2)}%`;
            const deltaLabel = new Text(deltaText, deltaStyle);
            deltaLabel.x = ohlcCursorX + 2;
            deltaLabel.y = margin.top + 4;
            app.stage.addChild(deltaLabel);
          }

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
  }, [appReadyTick, breakLevel, candles, candidateLevels, crosshair, drawableLegs, effectiveLivePrice, height, isHistorical, liveBoundaryIso, movingAverageSeries, range, rightOffsetBars, selectedTradeHighlight, timeframeMin, tradeMarkers, width, yAutoDomain, yCenterPrice, yZoom]);

  return (
    <div className="relative rounded-md border bg-slate-50 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-slate-800">{title} ({timeframeLabel})</div>
          <button
            type="button"
            onClick={centerChart}
            className="inline-flex items-center rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            Centrar
          </button>
        </div>
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
          {(range ? range.end - range.start + 1 : candles.length)}/{candles.length} bars | Ctrl+wheel zoom X | drag pan X/Y | drag right scale zoom Y
        </span>
        <span>
          {isHistorical
            ? `Source: historical (${symbol || "-"})`
            : `Source: ws+runtime (${symbol}) | ws ticks: ${wsTicks}`}
        </span>
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








