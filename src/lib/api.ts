"use client";

export class ApiClientError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
  /** true when the request never reached the server (offline, DNS, timeout) */
  get isNetwork() {
    return this.status === 0;
  }
}

export const UNAUTHORIZED_EVENT = "pos:unauthorized";

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  opts.signal?.addEventListener("abort", () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiClientError(0, "Can't reach the server — check the connection", "network");
  } finally {
    clearTimeout(timer);
  }
  let data: { error?: string; code?: string } & Record<string, unknown> = {};
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  if (isJson) {
    try {
      data = await res.json();
    } catch {}
  } else if (res.ok) {
    // e.g. a captive-portal or proxy page — treat as unreachable, not as data
    throw new ApiClientError(0, "Unexpected response from the network", "network");
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiClientError(res.status, data.error ?? `Request failed (${res.status})`, data.code);
  }
  return data as T;
}

export function newClientId(prefix: string) {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${id}`;
}
