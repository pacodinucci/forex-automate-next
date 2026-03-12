import { NextResponse } from "next/server";
import {
  backendFetch,
  relayBackendResponse,
  requireSession,
} from "@/lib/server/bot-backend";

export async function GET(request: Request) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol");

  if (!symbol) {
    return NextResponse.json({ detail: "symbol is required" }, { status: 400 });
  }

  const response = await backendFetch(`/market/price?symbol=${encodeURIComponent(symbol)}`);
  return relayBackendResponse(response);
}
