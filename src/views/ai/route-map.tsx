import { lazy, Suspense, type CSSProperties } from "react";
import type { MapNode, MapRoute } from "@/components/world-map";
import { validCoordinate } from "@/components/world-map/projection";
import { t } from "@/i18n";
import { maskedIp } from "@/lib/network";
import type { Geo } from "@/lib/types";
import { hideIpAtom } from "@/store/privacy";
import { getGeo } from "@/views/home/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import type { AiPlatform } from "./platforms";
import { probeAiDomain } from "./probe";

const WorldMap = lazy(() => import("@/components/world-map"));

const place = (geo?: Geo) => geo?.city || geo?.region || geo?.country || "";
const located = (
  geo?: Geo,
): geo is Geo & { latitude: number; longitude: number } =>
  Boolean(geo && validCoordinate(geo.latitude, geo.longitude));

/** Compact path map for one AI service: you → exit → service region. */
export function AiRouteMap({
  platform,
  domesticIp,
  exitIp,
}: {
  platform: AiPlatform;
  domesticIp?: string;
  exitIp?: string;
}) {
  const hidden = useAtomValue(hideIpAtom);
  const geoQuery = (ip?: string) => ({
    queryKey: ["geoip", ip],
    enabled: Boolean(ip),
    queryFn: ({ signal }: { signal: AbortSignal }) => getGeo(ip!, signal),
    staleTime: 60_000,
    retry: false,
  });
  const youGeo = useQuery(geoQuery(domesticIp)).data;
  const exitGeo = useQuery(geoQuery(exitIp)).data;
  const probe = useQuery({
    queryKey: ["ai-preview", "v3", platform.id],
    queryFn: ({ signal }) => probeAiDomain(platform.domain, signal),
    staleTime: 120_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const latency = probe.data?.median;
  const reachable = latency != null && latency >= 0;
  const tone = probe.isPending ? "muted" : reachable ? "ok" : "fail";
  const nodes: MapNode[] = [];
  const routes: MapRoute[] = [];
  if (located(youGeo))
    nodes.push({
      id: "you",
      lon: youGeo.longitude,
      lat: youGeo.latitude,
      label: [t("你"), place(youGeo)].filter(Boolean).join(" · "),
      sub: maskedIp(youGeo.ip, hidden),
      tone: "you",
      size: "lg",
    });
  const sameAsYou =
    located(exitGeo) &&
    located(youGeo) &&
    Math.abs(exitGeo.latitude - youGeo.latitude) < 1.2 &&
    Math.abs(exitGeo.longitude - youGeo.longitude) < 1.2;
  if (located(exitGeo) && !sameAsYou)
    nodes.push({
      id: "exit",
      lon: exitGeo.longitude,
      lat: exitGeo.latitude,
      label: [t("出口"), place(exitGeo)].filter(Boolean).join(" · "),
      sub: maskedIp(exitGeo.ip, hidden),
      tone: "egress",
    });
  nodes.push({
    id: "service",
    lon: platform.region[0],
    lat: platform.region[1],
    label: platform.name,
    sub: probe.isPending
      ? t("检测中…")
      : reachable
        ? `${latency} ms`
        : probe.data?.status === "restricted"
          ? t("检测受限")
          : t("未连通"),
    tone,
  });
  const chain = nodes.map((node) => node.id);
  for (let index = 1; index < chain.length; index += 1)
    routes.push({
      from: chain[index - 1],
      to: chain[index],
      tone: chain[index] === "service" ? tone : "egress",
      dashed: chain[index] === "service" && tone !== "ok",
    });
  return (
    <section
      className="v2-route-card"
      aria-label={t("{0} 访问路径", [platform.name])}
    >
      <div className="v2-route-card-head">
        <span className="v2-label">{t("访问路径")} · ROUTE</span>
        <span
          className={`v2-pill ${tone === "ok" ? "ok" : tone === "fail" ? "bad" : "cy"}`}
        >
          {probe.isPending
            ? t("检测中")
            : reachable
              ? t("可访问")
              : t("无法访问")}
        </span>
      </div>
      <Suspense fallback={<div className="world-map" />}>
        <WorldMap
          nodes={nodes}
          routes={routes}
          view={{ mode: "fit", minSpan: 360, pad: 80 }}
          labelSize={11.5}
          label={t("{0} 访问路径地图", [platform.name])}
        />
      </Suspense>
      <div className="v2-route-card-foot">
        <span>
          {t("你")} <b>{place(youGeo) || "—"}</b>
        </span>
        <span>
          {t("出口")}{" "}
          <b>{exitIp ? place(exitGeo) || maskedIp(exitIp, hidden) : "—"}</b>
        </span>
        <span>
          {platform.name}{" "}
          <b
            style={
              {
                color: reachable
                  ? "var(--lime)"
                  : probe.isPending
                    ? undefined
                    : "var(--danger)",
              } as CSSProperties
            }
          >
            {probe.isPending ? "…" : reachable ? `${latency} ms` : "✗"}
          </b>
        </span>
        <span>{t("服务位置为公司所在地近似值")}</span>
      </div>
    </section>
  );
}
