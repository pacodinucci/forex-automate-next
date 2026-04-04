import { NextResponse } from "next/server";
import { listBacktestDatasets, loadBacktestCandles, type BacktestStrategyKey } from "@/lib/backtesting-data";
import { simulateLegContinuationH4M15 } from "@/lib/backtesting-simulator";

const GRID_SL_VALUES = [100, 200, 250, 300, 400, 500, 600];
const GRID_TP_VALUES = [40, 60, 80, 100, 200, 250, 300, 400, 500, 600];

type GridRowAccumulator = {
  slPoints: number;
  tpPoints: number;
  totalTrades: number;
  winningTrades: number;
  totalPnlPoints: number;
  pairsProcessed: number;
  pairsWithTrades: number;
};

function createGridRows() {
  const rows = new Map<string, GridRowAccumulator>();
  for (const sl of GRID_SL_VALUES) {
    for (const tp of GRID_TP_VALUES) {
      rows.set(`${sl}:${tp}`, {
        slPoints: sl,
        tpPoints: tp,
        totalTrades: 0,
        winningTrades: 0,
        totalPnlPoints: 0,
        pairsProcessed: 0,
        pairsWithTrades: 0,
      });
    }
  }
  return rows;
}

function parseStrategy(value: string): BacktestStrategyKey | null {
  const strategy = value.trim().toLowerCase();
  if (strategy === "peak" || strategy === "break_retest" || strategy === "leg_continuation_h4_m15" || strategy === "fib") {
    return strategy;
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const strategyRaw = url.searchParams.get("strategy") ?? "leg_continuation_h4_m15";
    const strategy = parseStrategy(strategyRaw);
    const start = url.searchParams.get("start") ?? undefined;
    const end = url.searchParams.get("end") ?? undefined;

    if (!strategy) {
      return NextResponse.json({ error: "Invalid strategy" }, { status: 400 });
    }

    if (strategy !== "leg_continuation_h4_m15") {
      return NextResponse.json(
        { error: "Grid backtesting currently supports only leg_continuation_h4_m15." },
        { status: 400 }
      );
    }

    const datasets = await listBacktestDatasets();
    const symbols = datasets.symbols.filter((symbol) => {
      const timeframes = datasets.timeframesBySymbol[symbol] ?? [];
      const strategies = datasets.strategiesBySymbol[symbol] ?? [];
      return timeframes.includes("H4") && timeframes.includes("M15") && strategies.includes("leg_continuation_h4_m15");
    });

    const rows = createGridRows();

    for (const symbol of symbols) {
      const [h4, m15] = await Promise.all([
        loadBacktestCandles({ symbol, timeframe: "H4", start, end }),
        loadBacktestCandles({ symbol, timeframe: "M15", start, end }),
      ]);

      if (h4.length === 0 || m15.length === 0) {
        continue;
      }

      for (const sl of GRID_SL_VALUES) {
        for (const tp of GRID_TP_VALUES) {
          const key = `${sl}:${tp}`;
          const row = rows.get(key);
          if (!row) continue;

          const trades = simulateLegContinuationH4M15({
            symbol,
            h4,
            m15,
            pivotStrength: 2,
            slPoints: sl,
            tpPoints: tp,
          });

          const winningTrades = trades.filter((trade) => (trade.pnl_points ?? 0) > 0).length;
          const totalPnlPoints = trades.reduce((acc, trade) => acc + (trade.pnl_points ?? 0), 0);

          row.totalTrades += trades.length;
          row.winningTrades += winningTrades;
          row.totalPnlPoints += totalPnlPoints;
          row.pairsProcessed += 1;
          if (trades.length > 0) {
            row.pairsWithTrades += 1;
          }
        }
      }
    }

    const outRows = [...rows.values()]
      .map((row) => ({
        ...row,
        winRate: row.totalTrades > 0 ? (row.winningTrades / row.totalTrades) * 100 : 0,
      }))
      .sort((a, b) => b.totalPnlPoints - a.totalPnlPoints);

    return NextResponse.json({
      strategy,
      range: { start: start ?? null, end: end ?? null },
      symbols,
      slValues: GRID_SL_VALUES,
      tpValues: GRID_TP_VALUES,
      combinations: GRID_SL_VALUES.length * GRID_TP_VALUES.length,
      rows: outRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not run portfolio grid backtesting";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
