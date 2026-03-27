import { NextResponse } from "next/server";
import {
  backendFetch,
  relayBackendResponse,
  requireSession,
} from "@/lib/server/bot-backend";

type Params = {
  instrument: string;
  timeframe: string;
};

export async function GET(
  request: Request,
  context: { params: Promise<Params> }
) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const { instrument, timeframe } = await context.params;
  const inputUrl = new URL(request.url);
  const passthroughQuery = inputUrl.searchParams.toString();

  const basePath = `/history/${encodeURIComponent(instrument)}/${encodeURIComponent(timeframe)}`;
  const path = passthroughQuery ? `${basePath}?${passthroughQuery}` : basePath;

  const response = await backendFetch(path);
  return relayBackendResponse(response);
}
