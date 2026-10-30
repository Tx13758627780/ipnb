# Cloudflare egress check: root cause and fix

## Symptom

On the AI pages (`/ai/gpt`, `/ai/claude`, AI overview) the **Cloudflare** row of
"其他出口对照 / other egress comparison" always showed "暂不可用" with
"对照出口可能受连接或跨域限制。", regardless of which proxy node was selected.
The home connectivity tile for Cloudflare, the connectivity page target and the
WebRTC baseline used the same request.

## Root cause

Every one of these checks requested the IP literal
`https://1.1.1.1/cdn-cgi/trace` (3 s browser timeout).

Proxy nodes that are relayed through a **Cloudflare Worker** (VLESS / VMess over
WebSocket served by a Worker) open their upstream TCP connections with the
Workers `connect()` socket API. Workers sockets cannot connect to Cloudflare's
own anycast addresses, so a connection to `1.1.1.1` / `1.0.0.1` never completes.
The browser request hangs, hits the 3 s timeout, is aborted, and the row falls
back to "暂不可用". Choosing another Worker-relayed node changes nothing.

Ordinary hostnames on Cloudflare zones (for example `www.cloudflare.com`) are
reachable through the same nodes and return the same `/cdn-cgi/trace` data.

## Evidence (reproduced, not assumed)

- curl through each Worker-relayed node (local sing-box client):
  - `https://1.1.1.1/cdn-cgi/trace`, `https://1.0.0.1/cdn-cgi/trace` → timeout (curl rc 28 after 8–10 s)
  - `one.one.one.one`, `cloudflare-dns.com` → TLS failure (rc 35)
  - `www.cloudflare.com`, `cloudflare.com`, `speed.cloudflare.com`,
    `perfops.cloudflareperf.com`, `cdnjs.cloudflare.com`, `chatgpt.com` → HTTP 200 in 0.6–2 s
- Directly connected nodes (not Worker-relayed) return 200 for all of the above.
- Headless Chrome on the production site through a Worker-relayed node:
  `FAILED https://1.1.1.1/cdn-cgi/trace net::ERR_ABORTED`, Cloudflare row "暂不可用".
- Same node, this build: `RESP 200 https://www.cloudflare.com/cdn-cgi/trace`,
  Cloudflare row shows the egress IP.

## Fix

`cloudflareTrace()` in `src/lib/network.ts` tries `www.cloudflare.com` first and
falls back to `1.1.1.1` only if the hostname fails (abort is propagated, no
extra request after cancellation). All call sites use it, and the static
Cloudflare connectivity targets now use `https://www.cloudflare.com/cdn-cgi/trace`.
Regression tests: `tests/cloudflare-trace.test.mjs`.
