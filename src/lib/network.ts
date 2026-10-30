import { t } from "@/i18n";

export type ResponseMode = "json" | "text" | "opaque" | "headers";

/** Only HTTP transport for browser probes and API calls. Never proxy browser probes. */
export async function request<T>(
  url: string,
  init: RequestInit = {},
  mode: ResponseMode = "json",
): Promise<T> {
  const timeout = AbortSignal.timeout(12_000);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal });
        if (mode === "opaque") return undefined as T;
        if (!response.ok) {
          let message = t("请求失败 ({0})", [response.status]);
          try {
            const body = await response.json();
            if (typeof body.error === "string") message = t(body.error);
          } catch {
            /* Non-JSON upstream. */
          }
          throw new Error(message);
        }
        if (mode === "headers") return response.headers as T;
        return (
          mode === "text" ? response.text() : response.json()
        ) as Promise<T>;
      })(),
      aborted,
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export function endpoint<T>(path: string, init?: RequestInit) {
  return request<T>(
    `${import.meta.env.VITE_API_BASE_URL ?? "/api"}${path}`,
    init,
  );
}

export function parseTrace(text: string) {
  const fields = Object.fromEntries(
    text
      .trim()
      .split("\n")
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
  if (!fields.ip || !/^[\da-fA-F:.]+$/.test(fields.ip))
    throw new Error(t("目标站点未返回可读取的出口 IP"));
  return {
    ip: fields.ip,
    country_code: fields.loc,
    colo: fields.colo,
    source: "Cloudflare Trace",
  };
}

export async function trace(domain: string, signal?: AbortSignal) {
  return parseTrace(
    await request<string>(
      `https://${domain}/cdn-cgi/trace`,
      {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(3000)])
          : AbortSignal.timeout(3000),
        cache: "no-store",
      },
      "text",
    ),
  );
}

/**
 * Hosts used for the "Cloudflare" egress comparison, in priority order.
 *
 * Hostnames on regular Cloudflare zones come first. The IP literal 1.1.1.1 is
 * only a fallback: proxy nodes relayed through a Cloudflare Worker (VLESS/VMess
 * over WebSocket) cannot open sockets to Cloudflare's own anycast addresses, so
 * `https://1.1.1.1/cdn-cgi/trace` hangs until the browser timeout on every such
 * node while `www.cloudflare.com` answers normally.
 */
export const cloudflareTraceHosts = ["www.cloudflare.com", "1.1.1.1"] as const;

/** Egress address as seen by Cloudflare, falling back across trace hosts. */
export async function cloudflareTrace(
  signal?: AbortSignal,
  hosts: readonly string[] = cloudflareTraceHosts,
) {
  let lastError: unknown = new Error(t("目标站点未返回可读取的出口 IP"));
  for (const host of hosts) {
    signal?.throwIfAborted();
    try {
      return await trace(host, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export async function probe(url: string, signal?: AbortSignal) {
  const start = performance.now();
  try {
    await request<void>(
      url,
      {
        mode: "no-cors",
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(3000)])
          : AbortSignal.timeout(3000),
      },
      "opaque",
    );
    return Math.round(performance.now() - start);
  } catch (error) {
    if (signal?.aborted) throw error;
    return -1;
  }
}

/** Bound browser concurrency without retaining request state between runs. */
export async function pool<T, R>(
  items: T[],
  run: (item: T, index: number) => Promise<R>,
  limit = 6,
): Promise<R[]> {
  let cursor = 0;
  const results: R[] = new Array(items.length);
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await run(items[index], index);
      }
    }),
  );
  return results;
}

export function maskedIp(ip: string, hidden: boolean) {
  if (!hidden) return ip;
  return ip.includes(":")
    ? `${ip.split(":").slice(0, 2).join(":")}:****:****`
    : ip
        .split(".")
        .map((x, i) => (i > 1 ? "*" : x))
        .join(".");
}
