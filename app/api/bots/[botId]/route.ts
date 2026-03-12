import { NextResponse } from "next/server";
import type { UpdateBotPayload } from "@/lib/types";
import {
  backendFetch,
  parseBody,
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
  const response = await backendFetch(`/bots/${encodeURIComponent(botId)}`);
  return relayBackendResponse(response);
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const { botId } = await params;
  const payload = await parseBody<UpdateBotPayload>(request);

  const response = await backendFetch(`/bots/${encodeURIComponent(botId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return relayBackendResponse(response);
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const { botId } = await params;
  const response = await backendFetch(`/bots/${encodeURIComponent(botId)}`, {
    method: "DELETE",
  });

  return relayBackendResponse(response);
}
