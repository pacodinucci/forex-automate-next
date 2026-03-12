import { NextResponse } from "next/server";
import {
  backendFetch,
  relayBackendResponse,
  requireSession,
} from "@/lib/server/bot-backend";

type Params = {
  params: Promise<{ botId: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const { botId } = await params;
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ?? "100";

  const response = await backendFetch(
    `/bots/${encodeURIComponent(botId)}/logs?limit=${encodeURIComponent(limit)}`
  );

  return relayBackendResponse(response);
}
