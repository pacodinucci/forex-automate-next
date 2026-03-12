import { NextResponse } from "next/server";
import type { CreateBotPayload } from "@/lib/types";
import {
  backendFetch,
  parseBody,
  relayBackendResponse,
  requireSession,
} from "@/lib/server/bot-backend";

export async function GET(request: Request) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const backendPath = userId
    ? `/bots?userId=${encodeURIComponent(userId)}`
    : "/bots";

  const response = await backendFetch(backendPath);
  return relayBackendResponse(response);
}

export async function POST(request: Request) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const body = await parseBody<CreateBotPayload>(request);
  const payload: CreateBotPayload = {
    ...body,
    userId: body.userId ?? session.userId,
  };

  const response = await backendFetch("/bots", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return relayBackendResponse(response);
}
