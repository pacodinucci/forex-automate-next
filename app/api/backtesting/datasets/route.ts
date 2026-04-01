import { NextResponse } from "next/server";
import { listBacktestDatasets } from "@/lib/backtesting-data";

export async function GET() {
  try {
    const data = await listBacktestDatasets();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not list backtesting datasets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
