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
  const status = url.searchParams.get("status") ?? "ALL";

  const query = new URLSearchParams({
    limit,
    status,
  });

  const response = await backendFetch(
    `/bots/${encodeURIComponent(botId)}/registro?${query.toString()}`
  );
  return relayBackendResponse(response);
}
