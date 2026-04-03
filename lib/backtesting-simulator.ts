export type SimCandle = {
  time_utc: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type SimTrade = {
  id: string;
  side: "buy" | "sell" | "unknown";
  setup_time?: string;
  entry_time?: string;
  entry?: number;
  exit_time?: string;
  exit?: number;
  result?: string;
  pnl_points?: number;
};

type VisibleLeg = {
  startIdx: number;
  endIdx: number;
  direction: "bull" | "bear";
  startPrice: number;
  endPrice: number;
};

type Pivot = {
  pivotType: "high" | "low";
  index: number;
  pivotPrice: number;
};

function findPivots(candles: SimCandle[], strength: number): Pivot[] {
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

    if (isPivotHigh) pivots.push({ pivotType: "high", index: i, pivotPrice: hi });
    if (isPivotLow) pivots.push({ pivotType: "low", index: i, pivotPrice: lo });
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
    } else if (p.pivotPrice <= last.pivotPrice) {
      out[out.length - 1] = p;
    }
  }
  return out;
}

function buildLegsExtended(candles: SimCandle[], pivots: Pivot[]): VisibleLeg[] {
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
    legs.push({
      startIdx: from,
      endIdx: to,
      direction: legDirection,
      startPrice: legStart.pivotPrice,
      endPrice: legEnd.pivotPrice,
    });
  };

  for (const p of pivots.slice(2)) {
    if (direction === "bear") {
      if (p.pivotType === "low") {
        if (p.pivotPrice <= extreme.pivotPrice) extreme = p;
      } else if (refHigh !== null && p.pivotPrice > refHigh) {
        appendLeg(start, extreme, "bear");
        direction = "bull";
        start = extreme;
        extreme = p;
        refLow = start.pivotPrice;
        refHigh = null;
      } else {
        refHigh = p.pivotPrice;
      }
    } else if (p.pivotType === "high") {
      if (p.pivotPrice >= extreme.pivotPrice) extreme = p;
    } else if (refLow !== null && p.pivotPrice < refLow) {
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

  appendLeg(start, extreme, direction);
  return legs;
}

function pointSizeForSymbol(symbol: string) {
  return symbol.toUpperCase().includes("JPY") ? 0.001 : 0.00001;
}

function findM15Entry(
  m15: SimCandle[],
  startMs: number,
  endMs: number,
  side: "buy" | "sell",
  level: number
) {
  for (const candle of m15) {
    const ts = Date.parse(candle.time_utc);
    if (Number.isNaN(ts) || ts < startMs || ts > endMs) continue;
    if (side === "buy") {
      if (candle.low <= level && candle.close >= level) {
        return { time: candle.time_utc, entry: candle.close };
      }
    } else if (candle.high >= level && candle.close <= level) {
      return { time: candle.time_utc, entry: candle.close };
    }
  }
  return null;
}

function resolveExit(
  m15: SimCandle[],
  entryTimeUtc: string,
  side: "buy" | "sell",
  entry: number,
  slPoints: number,
  tpPoints: number,
  pointSize: number
) {
  const sl = side === "buy" ? entry - slPoints * pointSize : entry + slPoints * pointSize;
  const tp = side === "buy" ? entry + tpPoints * pointSize : entry - tpPoints * pointSize;
  const entryMs = Date.parse(entryTimeUtc);

  for (const candle of m15) {
    const ts = Date.parse(candle.time_utc);
    if (Number.isNaN(ts) || ts <= entryMs) continue;

    if (side === "buy") {
      const hitSl = candle.low <= sl;
      const hitTp = candle.high >= tp;
      if (hitSl && hitTp) {
        return { exitTime: candle.time_utc, exit: sl, result: "SL" as const };
      }
      if (hitSl) return { exitTime: candle.time_utc, exit: sl, result: "SL" as const };
      if (hitTp) return { exitTime: candle.time_utc, exit: tp, result: "TP" as const };
    } else {
      const hitSl = candle.high >= sl;
      const hitTp = candle.low <= tp;
      if (hitSl && hitTp) {
        return { exitTime: candle.time_utc, exit: sl, result: "SL" as const };
      }
      if (hitSl) return { exitTime: candle.time_utc, exit: sl, result: "SL" as const };
      if (hitTp) return { exitTime: candle.time_utc, exit: tp, result: "TP" as const };
    }
  }

  const last = m15[m15.length - 1];
  if (!last) return null;
  return { exitTime: last.time_utc, exit: last.close, result: "TIME" as const };
}

export function simulateLegContinuationH4M15(params: {
  symbol: string;
  h4: SimCandle[];
  m15: SimCandle[];
  pivotStrength?: number;
  slPoints?: number;
  tpPoints?: number;
}): SimTrade[] {
  const { symbol, h4, m15 } = params;
  const pivotStrength = Math.max(1, Math.floor(params.pivotStrength ?? 2));
  const slPoints = params.slPoints ?? 100;
  const tpPoints = params.tpPoints ?? 400;
  const pointSize = pointSizeForSymbol(symbol);

  const pivots = compressPivots(findPivots(h4, pivotStrength));
  const legs = buildLegsExtended(h4, pivots);
  if (legs.length < 3) return [];

  const trades: SimTrade[] = [];
  for (let i = 2; i < legs.length; i += 1) {
    const previous = legs[i - 2];
    const corrective = legs[i - 1];
    const current = legs[i];
    if (previous.direction !== current.direction) continue;
    if (corrective.direction === current.direction) continue;

    const side: "buy" | "sell" = current.direction === "bull" ? "buy" : "sell";
    const continuationLevel = previous.endPrice;
    const setupTime = h4[current.startIdx]?.time_utc;
    const searchStartMs = Date.parse(h4[current.startIdx]?.time_utc ?? "");
    const searchEndMs = Date.parse(h4[current.endIdx]?.time_utc ?? "");
    if (Number.isNaN(searchStartMs) || Number.isNaN(searchEndMs)) continue;

    let breakoutTimeMs = -1;
    for (let h4Idx = current.startIdx; h4Idx <= current.endIdx; h4Idx += 1) {
      const candle = h4[h4Idx];
      const ts = Date.parse(candle.time_utc);
      if (Number.isNaN(ts)) continue;
      const broken = side === "buy" ? candle.close > continuationLevel : candle.close < continuationLevel;
      if (broken) {
        breakoutTimeMs = ts;
        break;
      }
    }
    if (breakoutTimeMs < 0) continue;

    const entryData = findM15Entry(m15, breakoutTimeMs, searchEndMs, side, continuationLevel);
    if (!entryData) continue;

    const exitData = resolveExit(m15, entryData.time, side, entryData.entry, slPoints, tpPoints, pointSize);
    if (!exitData) continue;

    const pnlPointsRaw = side === "buy"
      ? (exitData.exit - entryData.entry) / pointSize
      : (entryData.entry - exitData.exit) / pointSize;
    const pnlPoints = Number.isFinite(pnlPointsRaw) ? Math.round(pnlPointsRaw * 100) / 100 : 0;

    trades.push({
      id: `sim-lc-${i}-${entryData.time}`,
      side,
      setup_time: setupTime,
      entry_time: entryData.time,
      entry: entryData.entry,
      exit_time: exitData.exitTime,
      exit: exitData.exit,
      result: exitData.result,
      pnl_points: pnlPoints,
    });
  }

  return trades;
}

