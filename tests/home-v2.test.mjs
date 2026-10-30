import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PROJECTION_SAMPLES,
} from "../src/components/world-map/frame.ts";
import {
  project,
  validCoordinate,
} from "../src/components/world-map/projection.ts";
import { buildNetworkMap } from "../src/views/home/network-map.ts";
import { aiReachable, aiVerdict } from "../src/views/home/verdict.ts";

test("runtime projection matches the pre-baked d3 geometry", () => {
  for (const [lon, lat, x, y] of PROJECTION_SAMPLES) {
    const [px, py] = project(lon, lat);
    assert.ok(
      Math.abs(px - x) < 0.5 && Math.abs(py - y) < 0.5,
      `${lon},${lat}`,
    );
    assert.ok(px >= 0 && px <= MAP_WIDTH && py >= 0 && py <= MAP_HEIGHT);
  }
  assert.ok(validCoordinate(31.2, 121.4));
  assert.ok(!validCoordinate(undefined, 121.4));
  assert.ok(!validCoordinate(0, 0), "0,0 is the unknown-location sentinel");
  assert.ok(!validCoordinate(91, 10));
});

const outcome = (id, latency, extra = {}) => ({
  id,
  name: id.toUpperCase(),
  latency,
  settled: latency !== null,
  ...extra,
});

test("verdict summarises real AI probes in one sentence", () => {
  const checking = aiVerdict([outcome("a", 120), outcome("b", null)]);
  assert.equal(checking.tone, "checking");
  const most = aiVerdict([
    ...Array.from({ length: 7 }, (_, index) => outcome(`ok${index}`, 100)),
    outcome("x", -1, { status: "restricted" }),
  ]);
  assert.equal(most.tone, "good");
  assert.equal(most.ok, 7);
  assert.equal(most.total, 8);
  assert.equal(most.title, "网络良好，大部分 AI 可直接使用");
  assert.deepEqual(
    most.failing.map((item) => item.id),
    ["x"],
  );
  assert.match(most.failing[0].reason, /检测受限/);
  const none = aiVerdict([outcome("a", -1), outcome("b", -1)]);
  assert.equal(none.tone, "bad");
  assert.match(none.failing[0].reason, /未连通/);
  assert.equal(
    aiVerdict([outcome("a", 1), outcome("b", 1)]).title,
    "网络良好，全部 AI 可直接使用",
  );
});
test("official incidents are surfaced even when the probe succeeds", () => {
  const verdict = aiVerdict([outcome("a", 80, { indicator: "major" })]);
  assert.equal(verdict.tone, "good");
  assert.match(verdict.failing[0].reason, /官方状态：严重故障/);
  assert.ok(aiReachable(outcome("a", 0)));
  assert.ok(!aiReachable(outcome("a", -1)));
});

const text = {
  reachable: (ok, total, average) => `${ok}/${total} ${average ?? ""}`,
  failed: "failed",
  pending: "pending",
};
const you = { id: "you", lat: 31.23, lon: 121.47, label: "Shanghai" };

test("network map routes domestic services from you and overseas via the egress", () => {
  const map = buildNetworkMap(
    you,
    [{ id: "v4", kind: "primary", lat: 35.68, lon: 139.69, label: "Tokyo" }],
    [
      {
        id: "gpt",
        name: "GPT",
        lon: -122,
        lat: 37,
        domestic: false,
        state: "ok",
        latency: 200,
      },
      {
        id: "claude",
        name: "Claude",
        lon: -122,
        lat: 37,
        domestic: false,
        state: "fail",
      },
      {
        id: "qwen",
        name: "Qwen",
        lon: 120,
        lat: 30,
        domestic: true,
        state: "ok",
        latency: 30,
      },
    ],
    text,
  );
  assert.equal(map.located, true);
  const byLabel = (label) => map.nodes.find((node) => node.label === label);
  const egress = byLabel("Tokyo");
  const route = (to) => map.routes.find((item) => item.to === to.id);
  assert.equal(route(byLabel("GPT")).from, egress.id);
  assert.equal(route(byLabel("Claude")).tone, "fail");
  assert.equal(route(byLabel("Claude")).dashed, true);
  assert.equal(route(byLabel("Qwen")).from, "you");
  assert.equal(byLabel("GPT").sub, "1/1 200");
});
test("network map degrades gracefully without a location", () => {
  const map = buildNetworkMap(
    { id: "you", label: "?" },
    [{ id: "v4", kind: "primary", lat: 0, lon: 0, label: "Unknown" }],
    [
      {
        id: "gpt",
        name: "GPT",
        lon: -122,
        lat: 37,
        domestic: false,
        state: "pending",
      },
    ],
    text,
  );
  assert.equal(map.located, false);
  assert.equal(map.routes.length, 0);
  assert.deepEqual(
    map.nodes.map((node) => node.tone),
    ["muted"],
  );
});
test("egress in the visitor's city merges and split exits are capped", () => {
  const map = buildNetworkMap(
    you,
    [
      {
        id: "v4",
        kind: "primary",
        lat: 31.3,
        lon: 121.5,
        label: "Shanghai exit",
      },
      ...[1, 2, 3, 4, 5].map((index) => ({
        id: `s${index}`,
        kind: "split",
        lat: 10 * index,
        lon: 10 * index,
        label: `S${index}`,
      })),
    ],
    [],
    text,
  );
  assert.equal(map.nodes.filter((node) => node.tone === "alt").length, 3);
  assert.ok(!map.nodes.some((node) => node.label === "Shanghai exit"));
});
