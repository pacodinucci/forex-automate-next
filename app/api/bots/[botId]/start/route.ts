import { NextResponse } from "next/server";
import {
  backendFetch,
  relayBackendResponse,
  requireSession,
} from "@/lib/server/bot-backend";

type Params = {
  params: Promise<{ botId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const { botId } = await params;
  const response = await backendFetch(`/bots/${encodeURIComponent(botId)}/start`, {
    method: "POST",
  });

  return relayBackendResponse(response);
}
