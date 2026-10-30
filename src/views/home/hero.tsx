import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ShareSite } from "@/components/share-site";
import { SiteLogo } from "@/components/site-logo";
import { ActionButton } from "@/components/toolkit";
import type { MapNode } from "@/components/world-map";
import { project } from "@/components/world-map/projection";
import { useIsMobile } from "@/hooks/use-mobile";
import { t } from "@/i18n";
import { ipScoreColor } from "@/lib/ip-score";
import { maskedIp } from "@/lib/network";
import { hideIpAtom } from "@/store/privacy";
import { aiPlatforms } from "@/views/ai/platforms";
import { useAtomValue } from "jotai";
import { CircleAlert, RefreshCw } from "lucide-react";
import { buildNetworkMap, type EgressPlace } from "./network-map";
import type { HomeData } from "./use-home-data";
import { aiReachable, aiVerdict, latencyColor } from "./verdict";

const WorldMap = lazy(() => import("@/components/world-map"));

const placeName = (geo?: {
  city?: string;
  region?: string;
  country?: string;
}) => geo?.city || geo?.region || geo?.country || "";

/** Pick a world-map window that keeps every node to the right of the panel. */
function heroView(points: [number, number][], reserve: number, aspect: number) {
  const xs = points.length ? points.map((point) => point[0]) : [470, 860];
  const ys = points.length ? points.map((point) => point[1]) : [150, 260];
  const pad = 70;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad * 2.2;
  const usable = 1 - reserve;
  let span = Math.max(760, (maxX - minX) / usable);
  // Tall content (e.g. Sydney + Tokyo) needs a wider span for the same aspect.
  span = Math.max(span, (Math.max(...ys) - Math.min(...ys) + 200) * aspect);
  span = Math.min(span, 1500);
  const x = minX - reserve * span;
  return { mode: "world" as const, span, offset: -x / span };
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function HomeHero({
  data,
  refresh,
  refreshing,
}: {
  data: HomeData;
  refresh: () => void;
  refreshing: boolean;
}) {
  const mobile = useIsMobile();
  const hidden = useAtomValue(hideIpAtom);
  const verdict = aiVerdict(data.aiOutcomes);
  const failingIds = new Set(verdict.failing.map((item) => item.id));

  // ---- Map -------------------------------------------------------------
  const external4 = data.cards.find(
    (card) => card.scope === "external" && card.version === 4,
  );
  const external6 = data.cards.find((card) => card.version === 6);
  const youGeo = data.domesticGeo ?? external4?.geo;
  const you = youGeo
    ? {
        id: "you",
        lat: youGeo.latitude,
        lon: youGeo.longitude,
        label: [t("你"), placeName(youGeo)].filter(Boolean).join(" · "),
        sub: data.domesticGeo
          ? maskedIp(youGeo.ip, hidden)
          : t("按出口 IP 推断"),
      }
    : undefined;
  const egress: EgressPlace[] = [];
  if (external4?.geo && data.domesticGeo)
    egress.push({
      id: "v4",
      kind: "primary",
      lat: external4.geo.latitude,
      lon: external4.geo.longitude,
      label: [t("海外出口"), placeName(external4.geo)]
        .filter(Boolean)
        .join(" · "),
      sub: maskedIp(external4.geo.ip, hidden),
    });
  if (external6?.geo)
    egress.push({
      id: "v6",
      kind: "v6",
      lat: external6.geo.latitude,
      lon: external6.geo.longitude,
      label: [t("IPv6 出口"), placeName(external6.geo)]
        .filter(Boolean)
        .join(" · "),
      sub: maskedIp(external6.geo.ip, hidden),
    });
  const known = new Set(data.cards.map((card) => card.data?.ip));
  const splitExits = new Map<
    string,
    {
      geo: NonNullable<(typeof data.splitRows)[number]["geo"]>;
      sites: string[];
    }
  >();
  for (const row of data.splitRows) {
    if (!row.geo || known.has(row.geo.ip)) continue;
    const entry = splitExits.get(row.geo.ip) ?? { geo: row.geo, sites: [] };
    entry.sites.push(row.site.name);
    splitExits.set(row.geo.ip, entry);
  }
  for (const [ip, { geo, sites }] of [...splitExits].sort(
    (a, b) => b[1].sites.length - a[1].sites.length,
  ))
    egress.push({
      id: `split-${ip}`,
      kind: "split",
      lat: geo.latitude,
      lon: geo.longitude,
      label: [t("分流出口"), placeName(geo)].filter(Boolean).join(" · "),
      sub: `${sites.slice(0, 2).join(" · ")}${sites.length > 2 ? ` +${sites.length - 2}` : ""}`,
    });
  const network = buildNetworkMap(
    you,
    egress,
    aiPlatforms.map((platform, index) => {
      const outcome = data.aiOutcomes[index];
      return {
        id: platform.id,
        name: platform.name,
        lon: platform.region[0],
        lat: platform.region[1],
        domestic: platform.domestic,
        latency: outcome.latency,
        state: !outcome.settled
          ? "pending"
          : aiReachable(outcome)
            ? "ok"
            : "fail",
      };
    }),
    {
      reachable: (ok, total, average) =>
        average != null
          ? t("{0}/{1} 可访问 · {2} ms", [ok, total, average])
          : t("{0}/{1} 可访问", [ok, total]),
      failed: t("无法访问"),
      pending: t("检测中…"),
    },
  );
  // Phones: the panel below lists every service, so the map keeps only the
  // topology labels (you, egress, failures) to stay legible.
  const compactNode = (node: MapNode): MapNode => ({
    ...node,
    sub: undefined,
    label:
      node.tone === "ok" || node.tone === "muted" || node.tone === "alt"
        ? undefined
        : node.label,
  });
  const points = network.nodes.map((node) => project(node.lon, node.lat));
  const view = mobile
    ? { mode: "fit" as const, minSpan: 330, pad: 55 }
    : heroView(points, 0.4, 1440 / 560);

  // ---- Panel -----------------------------------------------------------
  const clock = useClock();
  const percent = verdict.total ? (verdict.ok / verdict.total) * 100 : 0;
  const ringColor =
    verdict.tone === "checking"
      ? "var(--cyan)"
      : verdict.tone === "good"
        ? "var(--lime)"
        : verdict.tone === "warn"
          ? "var(--warning)"
          : "var(--danger)";
  const [head, ...rest] = verdict.title.split(/(?<=[，,:：])\s*/);
  const domesticIp = data.domestic.data?.ip;
  const routing =
    !domesticIp || !external4
      ? data.cards.length
        ? t("单一出口")
        : t("出口检测中")
      : external4.data?.ip !== domesticIp
        ? t("国内外已分流")
        : t("单一出口");
  const okLatencies = data.aiOutcomes.flatMap((outcome) =>
    aiReachable(outcome) ? [outcome.latency as number] : [],
  );
  const average = okLatencies.length
    ? Math.round(okLatencies.reduce((a, b) => a + b, 0) / okLatencies.length)
    : undefined;

  return (
    <section className="v2-hero" aria-labelledby="home-verdict">
      <div className="v2-hero-grid" aria-hidden="true" />
      <div className="v2-hero-map">
        <Suspense fallback={<div className="v2-hero-map-fallback" />}>
          <WorldMap
            nodes={mobile ? network.nodes.map(compactNode) : network.nodes}
            routes={network.routes}
            view={view}
            safeLeft={mobile ? 0 : 0.36}
            labelSize={mobile ? 10.5 : 12.5}
            label={t("网络路径地图：你的位置、出口与 AI 服务之间的连接")}
          />
        </Suspense>
      </div>
      <div className="v2-hero-inner">
        <div className="v2-hero-top">
          <div className="v2-panel">
            <div className="v2-panel-head">
              <span className="v2-label">
                {t("诊断结果")} ·{" "}
                <time className="mono">
                  {clock.toLocaleTimeString("en-GB", { hour12: false })}
                </time>
              </span>
              <span
                className={`v2-pill ${verdict.tone === "checking" ? "cy" : verdict.tone === "good" ? "ok" : verdict.tone}`}
              >
                {verdict.tone === "checking"
                  ? t("检测中 {0}/{1}", [verdict.settled, verdict.total])
                  : t("已完成")}
              </span>
            </div>
            <div className="v2-panel-body">
              <div className="v2-verdict" data-tone={verdict.tone}>
                <div
                  className="v2-ring"
                  style={
                    {
                      "--p": percent,
                      "--ring-color": ringColor,
                    } as CSSProperties
                  }
                  aria-hidden="true"
                >
                  <div>
                    <span>
                      <b>
                        {verdict.ok}/{verdict.total}
                      </b>
                      <small>AI OK</small>
                    </span>
                  </div>
                </div>
                <div>
                  <h1 id="home-verdict" aria-live="polite">
                    {rest.length ? (
                      <>
                        <span className="accent">{head}</span>{" "}
                        <span className="rest">{rest.join("")}</span>
                      </>
                    ) : (
                      head
                    )}
                    {verdict.tone !== "checking" && (
                      <span className="sr-only">
                        {" "}
                        · {verdict.ok}/{verdict.total}
                      </span>
                    )}
                  </h1>
                  <p>
                    {[
                      t("{0} 个出口", [data.cards.length]),
                      routing,
                      average != null
                        ? t("AI 平均 {0} ms", [average])
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              {verdict.failing.length > 0 && (
                <div className="v2-alert" role="note">
                  <CircleAlert aria-hidden="true" />
                  <ul>
                    {verdict.failing.slice(0, 3).map((item) => (
                      <li key={item.id} title={item.detail}>
                        <b>{item.name}</b> <span>{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="v2-ai-list">
                {aiPlatforms.map((platform, index) => {
                  const outcome = data.aiOutcomes[index];
                  const failed =
                    failingIds.has(platform.id) &&
                    outcome.settled &&
                    !aiReachable(outcome);
                  return (
                    <Link
                      key={platform.id}
                      to={`/ai/${platform.id}`}
                      className="v2-ai-row"
                      data-failed={failed}
                      title={outcome.description}
                    >
                      <SiteLogo website={`https://${platform.domain}`} />
                      <span>{platform.name}</span>
                      <span
                        className="v2-ms"
                        style={{
                          color: outcome.settled
                            ? latencyColor(outcome.latency)
                            : "var(--subtle)",
                        }}
                      >
                        {!outcome.settled
                          ? "···"
                          : aiReachable(outcome)
                            ? `${outcome.latency} ms`
                            : outcome.status === "restricted"
                              ? `✗ ${t("受限")}`
                              : `✗ ${t("未连通")}`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="v2-panel-foot">
              <ActionButton busy={refreshing} onClick={refresh}>
                <RefreshCw aria-hidden="true" />
                {refreshing ? t("检测中...") : t("重新检测")}
              </ActionButton>
              <ShareSite variant="button" />
            </div>
          </div>
          <div className="v2-legend" aria-hidden="true">
            <span>
              <i style={{ "--c": "var(--tone-you)" } as CSSProperties} />
              {t("你的位置")}
            </span>
            <span>
              <i style={{ "--c": "var(--tone-egress)" } as CSSProperties} />
              {t("出口 / 可访问")}
            </span>
            <span>
              <i style={{ "--c": "var(--tone-alt)" } as CSSProperties} />
              {t("分流出口")}
            </span>
            <span>
              <i style={{ "--c": "var(--tone-fail)" } as CSSProperties} />
              {t("无法访问")}
            </span>
          </div>
        </div>
        {!network.located && (
          <p className="v2-map-note">
            {data.domestic.isPending ||
            data.cards.some((card) => !card.geo?.country)
              ? t("正在定位出口…")
              : t("未能定位你的位置，地图仅显示已知的服务节点。")}
          </p>
        )}
        <HeroStats data={data} />
      </div>
    </section>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map(
      (value, index) =>
        `${((index / (values.length - 1)) * 100).toFixed(1)},${(18 - ((value - min) / range) * 16).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      className="v2-spark"
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--lime)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function HeroStats({ data }: { data: HomeData }) {
  const domestic = data.cards.filter(
    (card) => card.scope === "domestic",
  ).length;
  const foreign = data.cards.filter(
    (card) => card.scope === "external" && card.version === 4,
  ).length;
  const v6 = data.cards.filter((card) => card.version === 6).length;
  const latencies = data.connectivityResults.flatMap(({ result }) =>
    result?.median != null && result.median >= 0 ? [result.median] : [],
  );
  const average = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : undefined;
  const scored = [...data.cards]
    .sort(
      (a, b) => Number(b.scope === "external") - Number(a.scope === "external"),
    )
    .map((card) => ({
      card,
      score: data.typeByIp.get(card.data!.ip)?.data?.coffee?.trust_score,
    }))
    .find(
      ({ score }) =>
        typeof score === "number" &&
        Number.isFinite(score) &&
        score >= 0 &&
        score <= 100,
    );
  const supported = data.splitRows.filter(
    (row) => row.site.method !== "unsupported",
  );
  const read = supported.filter((row) => row.query.data).length;
  const splitPending = supported.some((row) => row.query.isPending);
  const statuses = [...data.statusById.entries()];
  const issues = statuses.filter(([, query]) => {
    const indicator = query.data?.status?.indicator;
    return indicator && indicator !== "none";
  });
  const statusPending = statuses.some(([, query]) => query.isPending);
  const issueNames = issues
    .map(([id]) => data.serviceName(id))
    .slice(0, 2)
    .join(" · ");
  const score = scored?.score as number | undefined;
  return (
    <div className="v2-stats">
      <Link to="/network/ip" className="v2-stat">
        <span className="v2-label">{t("出口 IP")}</span>
        <div className="v2-stat-value">
          {data.cards.length}
          <small>
            {t("国内 {0} · 海外 {1}", [domestic, foreign])}
            {v6 ? ` · IPv6 ${v6}` : ""}
          </small>
        </div>
      </Link>
      <Link to="/network/connectivity/" className="v2-stat">
        <span className="v2-label">{t("平均延迟")}</span>
        <div className="v2-stat-value">
          {average ?? "—"}
          <small>
            ms · {t("{0} 个站点", [data.connectivityResults.length])}
          </small>
        </div>
        <Sparkline values={latencies} />
      </Link>
      <Link
        to={
          scored
            ? `/network/ip/${encodeURIComponent(scored.card.data!.ip)}`
            : "/network/ip"
        }
        className="v2-stat"
      >
        <span className="v2-label">
          {scored?.card.scope === "external"
            ? t("海外 IP 信誉")
            : t("IP 信誉分")}
        </span>
        <div className="v2-stat-value">
          <span style={{ color: ipScoreColor(score) }}>{score ?? "—"}</span>
          <small>
            / 100
            {score != null
              ? ` · ${score >= 75 ? t("良好") : score >= 45 ? t("中等") : t("较差")}`
              : ""}
          </small>
        </div>
      </Link>
      <Link to="/network/exits" className="v2-stat">
        <span className="v2-label">{t("分流站点")}</span>
        <div className="v2-stat-value">
          {splitPending && !read ? "—" : read}
          <small>
            / {supported.length} · {t("已读取出口")}
          </small>
        </div>
      </Link>
      <Link to="/status/" className="v2-stat">
        <span className="v2-label">{t("服务异常")}</span>
        <div className="v2-stat-value">
          <span
            style={{ color: issues.length ? "var(--danger)" : "var(--lime)" }}
          >
            {statusPending && !issues.length ? "—" : issues.length}
          </span>
          <small>{issues.length ? issueNames : t("官方状态均正常")}</small>
        </div>
      </Link>
    </div>
  );
}
