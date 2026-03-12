import { NextResponse } from "next/server";
import {
  backendFetch,
  relayBackendResponse,
  requireSession,
} from "@/lib/server/bot-backend";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const { symbol } = await params;
  const response = await backendFetch(`/market/hub/symbol/${encodeURIComponent(symbol)}`);
  return relayBackendResponse(response);
}
