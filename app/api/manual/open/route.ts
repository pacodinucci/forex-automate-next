import { NextResponse } from "next/server";
import {
  backendFetch,
  parseBody,
  relayBackendResponse,
  requireSession,
} from "@/lib/server/bot-backend";

type ManualOpenPayload = {
  symbol: string;
  side: "buy" | "sell";
  volume: number;
};

export async function POST(request: Request) {
  const session = await requireSession(request.headers);
  if (session instanceof NextResponse) {
    return session;
  }

  const body = await parseBody<ManualOpenPayload>(request);

  const response = await backendFetch("/manual/open", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return relayBackendResponse(response);
}
