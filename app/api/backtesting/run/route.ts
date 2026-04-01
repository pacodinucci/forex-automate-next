import { NextResponse } from "next/server";
import {
  loadBacktestRun,
  type BacktestStrategyKey,
} from "@/lib/backtesting-data";

const VALID_STRATEGIES: BacktestStrategyKey[] = [
  "peak",
  "break_retest",
  "leg_continuation",
  "fib",
];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
    const timeframe = url.searchParams.get("timeframe")?.trim().toUpperCase() ?? "";
    const strategy = (url.searchParams.get("strategy")?.trim().toLowerCase() ?? "") as BacktestStrategyKey;
    const start = url.searchParams.get("start") ?? undefined;
    const end = url.searchParams.get("end") ?? undefined;

    if (!symbol || !timeframe || !strategy) {
      return NextResponse.json(
        { error: "Missing required params: symbol, timeframe, strategy" },
        { status: 400 }
      );
    }

    if (!VALID_STRATEGIES.includes(strategy)) {
      return NextResponse.json(
        { error: `Invalid strategy. Allowed: ${VALID_STRATEGIES.join(", ")}` },
        { status: 400 }
      );
    }

    const data = await loadBacktestRun({
      symbol,
      timeframe,
      strategy,
      start,
      end,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not run backtesting";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
