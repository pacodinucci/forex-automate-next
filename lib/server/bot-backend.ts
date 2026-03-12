import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPublicApiBaseUrl } from "@/lib/api-base";

const BOT_BACKEND_BASE =
  process.env.BOT_API_BASE_URL ?? getPublicApiBaseUrl();

type SessionResult = {
  userId: string;
};

export async function requireSession(headers: Headers): Promise<SessionResult | NextResponse> {
  const session = await auth.api.getSession({ headers });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { userId: session.user.id };
}

export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${BOT_BACKEND_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function relayBackendResponse(response: Response): Promise<NextResponse> {
  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => ({}));
    return NextResponse.json(json, { status: response.status });
  }

  const text = await response.text().catch(() => "");
  return NextResponse.json(
    {
      detail: text || response.statusText || "Backend error",
    },
    { status: response.status }
  );
}

export async function parseBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}
