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
  const limit = url.searchParams.get("limit") ?? "100";
  const status = url.searchParams.get("status") ?? "ALL";
  const symbol = url.searchParams.get("symbol");

  const query = new URLSearchParams({
    limit,
    status,
  });
  if (symbol) {
    query.set("symbol", symbol);
  }

  const response = await backendFetch(`/registro?${query.toString()}`);
  return relayBackendResponse(response);
}
