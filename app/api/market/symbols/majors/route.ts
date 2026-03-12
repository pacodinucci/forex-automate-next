import { NextResponse } from "next/server";
import {
  backendFetch,
  relayBackendResponse,
  requireSession,
} from "@/lib/server/bot-backend";

export async function GET(request: Request) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const response = await backendFetch("/market/symbols/majors");
  return relayBackendResponse(response);
}
