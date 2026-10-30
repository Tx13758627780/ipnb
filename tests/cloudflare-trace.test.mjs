import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync("src/lib/network.ts", "utf8").replace(
  'import { t } from "@/i18n";',
  "const t = (s) => s;",
);
const { cloudflareTrace, cloudflareTraceHosts } = await import(
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString("base64")}`
);
const body = (ip) => `fl=1\nh=x\nip=${ip}\nloc=NL\ncolo=AMS\n`;

test("Cloudflare egress prefers a hostname over the 1.1.1.1 IP literal", () => {
  assert.equal(cloudflareTraceHosts[0], "www.cloudflare.com");
  assert.ok(cloudflareTraceHosts.includes("1.1.1.1"));
  assert.ok(!/^\d/.test(cloudflareTraceHosts[0]));
});

test("Cloudflare egress succeeds when 1.1.1.1 is unreachable (Worker-relayed proxy nodes)", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).startsWith("https://1.1.1.1/"))
      return new Promise((_, reject) =>
        init.signal.addEventListener("abort", () => reject(init.signal.reason)),
      );
    return new Response(body("203.0.113.9"), { status: 200 });
  };
  try {
    const result = await cloudflareTrace();
    assert.equal(result.ip, "203.0.113.9");
    assert.equal(result.colo, "AMS");
    assert.deepEqual(calls, ["https://www.cloudflare.com/cdn-cgi/trace"]);
  } finally {
    globalThis.fetch = original;
  }
});

test("Cloudflare egress falls back to the next host when the first fails", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("www.cloudflare.com")) throw new TypeError("Failed to fetch");
    return new Response(body("198.51.100.7"), { status: 200 });
  };
  try {
    assert.equal((await cloudflareTrace()).ip, "198.51.100.7");
    assert.deepEqual(calls, [
      "https://www.cloudflare.com/cdn-cgi/trace",
      "https://1.1.1.1/cdn-cgi/trace",
    ]);
  } finally {
    globalThis.fetch = original;
  }
});

test("Cloudflare egress stops immediately when the caller aborts", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async (_url, init) => {
    count++;
    return new Promise((_, reject) =>
      init.signal.addEventListener("abort", () => reject(init.signal.reason)),
    );
  };
  try {
    const controller = new AbortController();
    const pending = cloudflareTrace(controller.signal);
    controller.abort(new DOMException("stop", "AbortError"));
    await assert.rejects(pending);
    assert.equal(count, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("UI call sites no longer depend on the 1.1.1.1 IP literal", () => {
  for (const file of [
    "src/views/ai/index.tsx",
    "src/views/gpt/api.ts",
    "src/views/claude/api.ts",
    "src/views/webrtc/api.ts",
    "src/components/connectivity.tsx",
    "src/views/link/targets.json",
  ])
    assert.ok(!readFileSync(file, "utf8").includes("https://1.1.1.1") && !readFileSync(file, "utf8").includes('trace("1.1.1.1"'), file);
});
