import { NextResponse } from "next/server";
import { loadBacktestCandles } from "@/lib/backtesting-data";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
    const timeframe = url.searchParams.get("timeframe")?.trim().toUpperCase() ?? "";
    const start = url.searchParams.get("start") ?? undefined;
    const end = url.searchParams.get("end") ?? undefined;

    if (!symbol || !timeframe) {
      return NextResponse.json(
        { error: "Missing required params: symbol, timeframe" },
        { status: 400 }
      );
    }

    const candles = await loadBacktestCandles({ symbol, timeframe, start, end });
    return NextResponse.json({ symbol, timeframe, count: candles.length, candles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load candles";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
