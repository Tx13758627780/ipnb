import { t } from "@/i18n";
import type { Geo } from "@/lib/types";

export interface ProbeLike {
  data?: Geo;
  isPending?: boolean;
  isError?: boolean;
}
export interface EgressCard<Q extends ProbeLike = ProbeLike> {
  query: Q;
  data?: Geo;
  version: 4 | 6;
  scope: "domestic" | "external";
  label: string;
}

/**
 * Overview egress tickets. Domestic and external IPv4 probes only accept IPv4
 * answers (a routed IPv6 must never masquerade as the local egress); the
 * dedicated IPv6 probe only accepts IPv6. Identical IPv4 answers collapse.
 */
export function egressCards<Q extends ProbeLike>(
  domestic: Q,
  external4: Q,
  external6?: Q,
): EgressCard<Q>[] {
  const cards: EgressCard<Q>[] = [];
  if (domestic.data && !domestic.data.ip.includes(":"))
    cards.push({
      query: domestic,
      data: domestic.data,
      version: 4,
      scope: "domestic",
      label: t("IPv4 · 国内探测"),
    });
  if (
    external4.data &&
    !external4.data.ip.includes(":") &&
    external4.data.ip !== domestic.data?.ip
  )
    cards.push({
      query: external4,
      data: external4.data,
      version: 4,
      scope: "external",
      label: t("IPv4 · 外部探测"),
    });
  if (external6?.data?.ip.includes(":"))
    cards.push({
      query: external6,
      data: external6.data,
      version: 6,
      scope: "external",
      label: t("IPv6 · 外部探测"),
    });
  return cards;
}

/** Query families the overview owns; 重新检测 cancels and resets only these. */
export const refreshKeys = [
  "home-domestic-ip",
  "browser-ip",
  "split",
  "geoip",
  "lookup-ip-coffee",
  "connectivity",
  "connectivity-progress",
  "ai-preview",
  "service-status",
  "home-dns",
  "home-webrtc",
  "webrtc-diagnostic",
  "home-browser-fingerprint",
];

export const isHomeQuery = (queryKey: readonly unknown[]) =>
  refreshKeys.includes(String(queryKey[0]));
