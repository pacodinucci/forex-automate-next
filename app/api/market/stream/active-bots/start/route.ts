import { NextResponse } from "next/server";
import {
  backendFetch,
  relayBackendResponse,
  requireSession,
} from "@/lib/server/bot-backend";

export async function POST(request: Request) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const response = await backendFetch("/market/stream/active-bots/start", {
    method: "POST",
  });

  return relayBackendResponse(response);
}
