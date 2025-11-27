const APP_API_BASE = "/api";

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
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText);
  }

  return res.json() as Promise<T>;
}
