import { NextResponse } from "next/server";
import {
  backendFetch,
  parseBody,
  relayBackendResponse,
  requireSession,
} from "@/lib/server/bot-backend";

type ManualClosePayload = {
  position_id: number;
};

export async function POST(request: Request) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const body = await parseBody<ManualClosePayload>(request);

  const response = await backendFetch("/manual/close", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return relayBackendResponse(response);
}
