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
  startIdx: number;
  endIdx: number;
  high: number;
  low: number;
  direction: "bull" | "bear";
};

type BreakLevel = {
  price: number;
  direction: "bull" | "bear";
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

function buildVisibleLegs(candles: Candle[]): VisibleLeg[] {
  if (candles.length === 0) return [];

  const legs: VisibleLeg[] = [];
  let startIdx = 0;
  let direction: "bull" | "bear" = candles[0].close >= candles[0].open ? "bull" : "bear";
  let high = candles[0].high;
  let low = candles[0].low;

  for (let i = 1; i < candles.length; i += 1) {
    const candle = candles[i];
    const nextDirection: "bull" | "bear" = candle.close >= candle.open ? "bull" : "bear";
    if (nextDirection === direction) {
      high = Math.max(high, candle.high);
      low = Math.min(low, candle.low);
      continue;
    }

    legs.push({
      startIdx,
      endIdx: i - 1,
      high,
      low,
      direction,
    });

    startIdx = i;
    direction = nextDirection;
    high = candle.high;
    low = candle.low;
  }

  legs.push({
    startIdx,
    endIdx: candles.length - 1,
    high,
    low,
    direction,
  });

  return legs;
}

function getBreakLevelFromLegs(legs: VisibleLeg[]): BreakLevel | null {
  if (legs.length < 2) return null;
  const current = legs[legs.length - 1];
  for (let i = legs.length - 2; i >= 0; i -= 1) {
    const previous = legs[i];
    if (previous.direction !== current.direction) continue;
    return {
      price: current.direction === "bull" ? previous.high : previous.low,
      direction: current.direction,
    };
  }
  return null;
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
}: Props) {
  const ZOOM_IN_FACTOR = 0.84;
  const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<import("pixi.js").Application | null>(null);
  const drawLayoutRef = useRef<DrawLayout | null>(null);
  const rangeRef = useRef<{ start: number; end: number } | null>(null);
  const draggingRef = useRef<{ active: boolean; x: number }>({ active: false, x: 0 });
  const userInteractedRef = useRef(false);
  const appliedSnapshotRef = useRef<string>("");

  const [width, setWidth] = useState(900);
  const [appReadyTick, setAppReadyTick] = useState(0);
  const [candles, setCandles] = useState<Candle[]>(normalizeFallback(candlesFallback));
  const [wsTicks, setWsTicks] = useState(0);
  const [wsLive, setWsLive] = useState<{ price?: number; timestamp?: number }>({});
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);

  const timeframeMin = useMemo(() => timeframeToMinutes(timeframeLabel), [timeframeLabel]);
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
  }, [fallbackSignature, symbol, timeframeLabel, normalizedFallback]);

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
        const initialVisible = Math.min(140, candles.length);
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
        const next = [
          ...current,
          {
            time_utc: bucketIso,
            open: last.close,
            high: Math.max(last.close, effectiveLivePrice),
            low: Math.min(last.close, effectiveLivePrice),
            close: effectiveLivePrice,
          },
        ];
        return next.slice(-2000);
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
      draggingRef.current = { active: true, x: event.clientX };
      canvas.style.cursor = "grabbing";
    };

    const onMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      setCrosshair({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      if (!draggingRef.current.active) return;
      const layout = drawLayoutRef.current;
      const current = rangeRef.current;
      if (!layout || !current) return;

      const dx = event.clientX - draggingRef.current.x;
      draggingRef.current.x = event.clientX;
      const visible = current.end - current.start + 1;
      const shift = Math.round((-dx / layout.innerWidth) * visible);
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
      canvas.style.cursor = "crosshair";
    };
    const onMouseLeave = () => setCrosshair(null);

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
  }, [appReadyTick, candles.length]);

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
    if (candles.length === 0) return;
    const end = candles.length - 1;
    const visible = Math.min(140, candles.length);
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
      const pad = Math.max((max - min) * 0.1, 0.00002);
      const pTop = max + pad;
      const pBottom = min - pad;
      const pRange = Math.max(pTop - pBottom, 0.00002);
      const toY = (p: number) => margin.top + ((pTop - p) / pRange) * innerHeight;

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

      if (showLegLabels) {
        const legs = buildVisibleLegs(visible);
        legs.forEach((leg, idx) => {
          const left = margin.left + leg.startIdx * slot + slot * 0.1;
          const right = margin.left + (leg.endIdx + 1) * slot - slot * 0.1;
          const top = toY(leg.high);
          const bottom = toY(leg.low);
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

          const label = new Text(`Leg ${idx + 1}`, new TextStyle({
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
  }, [appReadyTick, candles, continuationLevel, crosshair, height, range, timeframeMin, width]);

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
          {(range ? range.end - range.start + 1 : candles.length)}/{candles.length} bars | Ctrl+wheel zoom | drag pan
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
