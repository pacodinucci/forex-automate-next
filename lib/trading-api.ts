import { getPublicApiBaseUrl } from "@/lib/endpoints";

const API_BASE = getPublicApiBaseUrl();

export async function tradingApi<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText);
  }

  return res.json() as Promise<T>;
}

