import { NextResponse } from "next/server";
import type { DryRunPayload } from "@/lib/types";
import {
  backendFetch,
  parseBody,
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
  const payload = await parseBody<DryRunPayload>(request);

  const response = await backendFetch(`/bots/${encodeURIComponent(botId)}/dry-run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return relayBackendResponse(response);
}
