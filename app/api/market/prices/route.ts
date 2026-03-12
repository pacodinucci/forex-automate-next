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
  const symbols = url.searchParams.get("symbols");

  if (!symbols) {
    return NextResponse.json({ detail: "symbols is required" }, { status: 400 });
  }

  const response = await backendFetch(`/market/prices?symbols=${encodeURIComponent(symbols)}`);
  return relayBackendResponse(response);
}
