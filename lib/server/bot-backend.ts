import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getServerApiBaseUrl } from "@/lib/endpoints";

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

function backendUnavailableResponse(path: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Backend unavailable";
  const baseUrl = (() => {
    try {
      return getServerApiBaseUrl();
    } catch {
      return "(missing backend base URL config)";
    }
  })();

  return new Response(
    JSON.stringify({
      error: "Backend unavailable",
      detail: `Could not reach backend at ${baseUrl}${path}. ${message}`,
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  let backendBase = "";

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  try {
    backendBase = getServerApiBaseUrl();
  } catch (error) {
    return backendUnavailableResponse(path, error);
  }

  try {
    return await fetch(`${backendBase}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    return backendUnavailableResponse(path, error);
  }
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
