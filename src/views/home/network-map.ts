import type { MapNode, MapRoute } from "../../components/world-map/index.tsx";
import { validCoordinate } from "../../components/world-map/projection.ts";

export interface Place {
  id: string;
  lat?: number;
  lon?: number;
  label: string;
  sub?: string;
}
export interface EgressPlace extends Place {
  kind: "primary" | "v6" | "split";
}
export interface ServicePlace {
  id: string;
  name: string;
  lon: number;
  lat: number;
  domestic: boolean;
  state: "ok" | "fail" | "pending";
  latency?: number | null;
}
export interface NetworkMapText {
  reachable: (ok: number, total: number, average?: number) => string;
  failed: string;
  pending: string;
}
export interface NetworkMap {
  nodes: MapNode[];
  routes: MapRoute[];
  /** False when the visitor could not be placed on the map. */
  located: boolean;
}

const near = (a: MapNode, b: { lat: number; lon: number }) =>
  Math.abs(a.lat - b.lat) < 1.2 && Math.abs(a.lon - b.lon) < 1.2;
const placed = (place?: Place): place is Place & { lat: number; lon: number } =>
  Boolean(place && validCoordinate(place.lat, place.lon));
const joinNames = (names: string[]) =>
  names.length > 3
    ? `${names.slice(0, 3).join(" · ")} +${names.length - 3}`
    : names.join(" · ");

/**
 * Turn the live probes into map nodes and routes. Unknown locations are simply
 * left out: domestic services connect to the visitor, overseas services to the
 * primary foreign egress when there is one, otherwise directly.
 */
export function buildNetworkMap(
  you: Place | undefined,
  egress: EgressPlace[],
  services: ServicePlace[],
  text: NetworkMapText,
): NetworkMap {
  const nodes: MapNode[] = [];
  const routes: MapRoute[] = [];
  let youNode: MapNode | undefined;
  if (placed(you)) {
    youNode = {
      id: "you",
      lon: you.lon,
      lat: you.lat,
      label: you.label,
      sub: you.sub,
      tone: "you",
      size: "lg",
    };
    nodes.push(youNode);
  }
  let primary: MapNode | undefined;
  let splitCount = 0;

  for (const place of egress) {
    if (!placed(place)) continue;
    if (place.kind === "split" && splitCount >= 3) continue;
    const existing = nodes.find((node) => near(node, place));
    if (existing) {
      // Same city as an existing node: keep one marker and enrich it.
      if (
        existing.id !== "you" &&
        place.kind !== "split" &&
        !existing.sub?.includes(place.sub ?? "\0")
      )
        existing.sub = [existing.sub, place.sub].filter(Boolean).join(" / ");
      if (place.kind === "primary" && !primary && existing.id !== "you")
        primary = existing;
      continue;
    }
    const node: MapNode = {
      id: `egress-${place.id}`,
      lon: place.lon,
      lat: place.lat,
      label: place.label,
      sub: place.sub,
      tone: place.kind === "split" ? "alt" : "egress",
      size: place.kind === "split" ? "sm" : "md",
    };
    if (place.kind === "split") splitCount += 1;
    nodes.push(node);
    if (place.kind === "primary" && !primary) primary = node;
    if (youNode)
      routes.push({
        from: youNode.id,
        to: node.id,
        tone: node.tone,
        dashed: place.kind !== "primary",
      });
  }
  // Group services by region and outcome so the map stays legible.
  const groups = new Map<string, ServicePlace[]>();
  for (const service of services) {
    const key = `${service.lon},${service.lat},${service.state === "fail" ? "fail" : "ok"}`;
    groups.set(key, [...(groups.get(key) ?? []), service]);
  }
  for (const [key, members] of groups) {
    const failed = key.endsWith(",fail");
    const pending = members.every((member) => member.state === "pending");
    const ok = members.filter((member) => member.state === "ok");
    const latencies = ok.flatMap((member) =>
      member.latency != null && member.latency >= 0 ? [member.latency] : [],
    );
    const average = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : undefined;
    const { lon, lat, domestic } = members[0];
    const node: MapNode = {
      id: `svc-${key}`,
      // Failed services sit just beside the reachable ones of the same region.
      lon: failed ? lon + 5 : lon,
      lat: failed ? lat - 6 : lat,
      label: joinNames(members.map((member) => member.name)),
      sub: pending
        ? text.pending
        : failed
          ? text.failed
          : text.reachable(ok.length, members.length, average),
      tone: pending ? "muted" : failed ? "fail" : "ok",
      size: "md",
    };
    nodes.push(node);
    const from = domestic ? youNode : (primary ?? youNode);
    if (from)
      routes.push({
        from: from.id,
        to: node.id,
        tone: node.tone,
        dashed: failed || pending,
      });
  }
  return { nodes, routes, located: Boolean(youNode) };
}
