import { NextResponse } from "next/server";
import type { BulkCreateBotsPayload } from "@/lib/types";
import {
  backendFetch,
  parseBody,
  relayBackendResponse,
  requireSession,
} from "@/lib/server/bot-backend";

export async function POST(request: Request) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const body = await parseBody<BulkCreateBotsPayload>(request);
  const payload: BulkCreateBotsPayload = {
    ...body,
    userId: body.userId ?? session.userId,
  };

  const response = await backendFetch("/bots/bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return relayBackendResponse(response);
}
