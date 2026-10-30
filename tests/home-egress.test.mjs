import assert from "node:assert/strict";
import { test } from "node:test";
import { egressCards, isHomeQuery } from "../src/views/home/egress.ts";

const failed = { isPending: false, isError: true };
const ipv4 = { data: { ip: "192.0.2.1" } };
const proxy = { data: { ip: "192.0.2.2" } };
const ipv6 = { data: { ip: "2001:db8::1" } };

test("domestic egress comes first and external IPv4 remains separate", () => {
  const cards = egressCards(ipv4, proxy, failed);
  assert.deepEqual(
    cards.map((card) => [card.data.ip, card.label, card.scope]),
    [
      ["192.0.2.1", "IPv4 · 国内探测", "domestic"],
      ["192.0.2.2", "IPv4 · 外部探测", "external"],
    ],
  );
});
test("matching domestic and external IPv4 produces one card", () => {
  assert.equal(egressCards(ipv4, { data: { ip: "192.0.2.1" } }).length, 1);
});
test("failed domestic probe never promotes a proxy or routed IPv6 to local egress", () => {
  const cards = egressCards(failed, ipv4, failed);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].scope, "external");
  assert.ok(!egressCards(ipv6, failed).length);
  assert.ok(!egressCards(failed, ipv6).length);
});
test("IPv6 card only accepts IPv6 answers from the dedicated probe", () => {
  assert.deepEqual(
    egressCards(ipv4, failed, ipv6).map((card) => [card.version, card.label]),
    [
      [4, "IPv4 · 国内探测"],
      [6, "IPv6 · 外部探测"],
    ],
  );
  assert.equal(egressCards(ipv4, failed, proxy).length, 1);
});
test("home retest resets only home query families", () => {
  assert.ok(isHomeQuery(["connectivity", "https://example.com", 0]));
  assert.ok(isHomeQuery(["split", "Example", 0]));
  assert.ok(isHomeQuery(["ai-preview", "v3", "gpt"]));
  assert.ok(!isHomeQuery(["whois", "example.com"]));
});
