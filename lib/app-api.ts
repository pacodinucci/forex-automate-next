const APP_API_BASE = "/api";

type ApiErrorBody = {
  detail?: string;
  error?: string;
  message?: string;
};

function getErrorMessage(body: ApiErrorBody | null, fallback: string) {
  return body?.detail ?? body?.error ?? body?.message ?? fallback;
}

export async function appApi<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${APP_API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      throw new Error(getErrorMessage(body, res.statusText || "Unexpected error"));
    }

    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText || "Unexpected error");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
