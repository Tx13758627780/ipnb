import { type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { CountryFlag } from "@/components/country-flag";
import { SiteLogo } from "@/components/site-logo";
import { IpText, Pending } from "@/components/toolkit";
import { t } from "@/i18n";
import { ipScoreColor } from "@/lib/ip-score";
import { maskedIp } from "@/lib/network";
import { hideIpAtom } from "@/store/privacy";
import { aiPlatforms } from "@/views/ai/platforms";
import { BrowserSummary } from "@/views/browser/summary";
import { statusOrder } from "@/views/status/order";
import { useAtomValue } from "jotai";
import {
  Activity,
  ArrowUpRight,
  Fingerprint,
  Network,
  Search,
  ShieldCheck,
} from "lucide-react";
import { featuredServiceIds, services, type HomeData } from "./use-home-data";
import { latencyColor } from "./verdict";
import { aiReachable } from "./verdict";

const statusLabels: Record<string, string> = {
  none: t("正常运行"),
  minor: t("轻微故障"),
  major: t("严重故障"),
  critical: t("重大故障"),
  maintenance: t("维护中"),
};
const statusColor = (indicator?: string) =>
  !indicator
    ? "var(--subtle)"
    : indicator === "none"
      ? "var(--lime)"
      : indicator === "minor" || indicator === "maintenance"
        ? "var(--warning)"
        : "var(--danger)";

function SectionHead({
  title,
  tag,
  link,
  id,
}: {
  id?: string;
  title: string;
  tag: string;
  link?: { to: string; label: string };
}) {
  return (
    <div className="v2-section-head">
      <h2 id={id}>{title}</h2>
      <span className="v2-label">{tag}</span>
      {link && <Link to={link.to}>{link.label}</Link>}
    </div>
  );
}

/* ---------------------------------------------------------------- Egress */
function companyTags(company?: {
  company_type?: string;
  is_public_service?: boolean;
  isResidential?: boolean;
  is_datacenter?: boolean;
  is_mobile?: boolean;
  is_proxy?: boolean;
  is_vpn?: boolean;
  is_tor?: boolean;
}) {
  if (!company) return [];
  return [
    company.company_type ? { label: company.company_type, tone: "" } : null,
    company.is_public_service === true
      ? { label: t("公共服务"), tone: "cy" }
      : null,
    company.isResidential === true && !company.is_public_service
      ? { label: t("家庭住宅 IP"), tone: "ok" }
      : null,
    company.is_datacenter === true && !company.is_public_service
      ? { label: t("机房 IP"), tone: "warn" }
      : null,
    company.is_mobile === true ? { label: t("移动网络"), tone: "cy" } : null,
    company.is_proxy === true ||
    company.is_vpn === true ||
    company.is_tor === true
      ? { label: t("代理 / VPN / Tor"), tone: "bad" }
      : null,
  ].filter((item) => item !== null);
}

export function EgressSection({ data }: { data: HomeData }) {
  const { cards } = data;
  const pending = data.domestic.isPending && !cards.length;
  return (
    <section aria-labelledby="home-egress">
      <div className="v2-section-head">
        <h2 id="home-egress">{t("出口 IP")}</h2>
        <span className="v2-label">
          EGRESS · {t("{0} 个地址", [cards.length])}
        </span>
        <Link to="/network/ip">{t("IP 查询 ›")}</Link>
      </div>
      <div className="v2-grid v2-tickets">
        {pending && (
          <div className="v2-card v2-span-3">
            <Pending>{t("加载中...")}</Pending>
          </div>
        )}
        {cards.map(({ data: probe, geo, label, scope, version }) => {
          const ip = probe!.ip;
          const lookup = data.typeByIp.get(ip);
          const company = lookup?.isSuccess ? lookup.data.coffee : undefined;
          const score = company?.trust_score;
          const hasScore =
            typeof score === "number" &&
            Number.isFinite(score) &&
            score >= 0 &&
            score <= 100;
          const geoPending = data.geoByIp.get(ip)?.isPending;
          const tags = companyTags(company);
          return (
            <Link
              key={`${label}-${ip}`}
              to={`/network/ip/${encodeURIComponent(ip)}`}
              className="v2-card v2-ticket v2-span-3"
              aria-label={`${label} · ${t("IP 信息查询")}`}
            >
              <div className="v2-ticket-top">
                <span className="v2-label">
                  {scope === "domestic" ? t("国内") : t("海外")} · IPv{version}
                </span>
                <span
                  className={`v2-pill ${scope === "domestic" ? "cy" : "ok"}`}
                >
                  {scope === "domestic"
                    ? t("直连")
                    : version === 6
                      ? "IPv6"
                      : t("外部")}
                </span>
              </div>
              <div className="v2-ticket-ip">
                <CountryFlag code={geo?.country_code} />
                <IpText ip={ip} link={false} />
              </div>
              <div className="v2-ticket-meta">
                {geoPending ? (
                  <Pending>{t("正在查询归属信息…")}</Pending>
                ) : geo?.country || geo?.isp ? (
                  <>
                    <p>
                      {[geo.country, geo.region, geo.city]
                        .filter(Boolean)
                        .filter((item, i, all) => all.indexOf(item) === i)
                        .join(" · ")}
                    </p>
                    <p>
                      {[geo.asn ? `AS${geo.asn}` : undefined, geo.isp]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </>
                ) : (
                  <p>{t("归属信息暂不可用")}</p>
                )}
              </div>
              {tags.length > 0 && (
                <div className="v2-ticket-tags">
                  {tags.slice(0, 3).map((tag) => (
                    <span key={tag.label} className={`v2-pill ${tag.tone}`}>
                      {tag.label}
                    </span>
                  ))}
                </div>
              )}
              <div className="v2-ticket-score">
                <span>{t("信誉分")}</span>
                <span className="v2-bar">
                  <i
                    style={
                      {
                        width: `${hasScore ? score : 0}%`,
                        "--c": ipScoreColor(score),
                      } as CSSProperties
                    }
                  />
                </span>
                <b style={{ color: ipScoreColor(score) }}>
                  {hasScore ? score : lookup?.isPending ? "…" : "—"}
                </b>
              </div>
            </Link>
          );
        })}
        {!pending && !cards.length && (
          <div className="v2-card v2-span-12">
            <p className="v2-ticket-meta">
              {t("未获取到出口 IP，请稍后重新检测。")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------ Latency chart + split */
export function LatencySection({ data }: { data: HomeData }) {
  const hidden = useAtomValue(hideIpAtom);
  const bars = [
    ...data.connectivityResults.map(({ target, query, result }) => ({
      key: target.url,
      name: target.name,
      logo: <SiteLogo src={target.icon} website={target.url} />,
      to: "/network/connectivity/",
      pending: query.isFetching || query.isPending,
      latency: result?.median,
      kind: "site" as const,
    })),
    ...aiPlatforms.slice(0, 6).map((platform) => {
      const outcome = data.aiOutcomes.find((item) => item.id === platform.id)!;
      return {
        key: platform.id,
        name: platform.name,
        logo: <SiteLogo website={`https://${platform.domain}`} />,
        to: `/ai/${platform.id}`,
        pending: !outcome.settled,
        latency: outcome.latency,
        kind: "ai" as const,
      };
    }),
  ];
  const max = Math.max(
    200,
    ...bars.flatMap((bar) =>
      bar.latency != null && bar.latency >= 0 ? [bar.latency] : [],
    ),
  );
  const supported = data.splitRows.filter(
    (row) => row.site.method !== "unsupported",
  );
  const groups = new Map<
    string,
    {
      ip: string;
      country?: string;
      code?: string;
      place: string;
      sites: typeof supported;
    }
  >();
  for (const row of supported) {
    if (!row.geo) continue;
    const entry = groups.get(row.geo.ip) ?? {
      ip: row.geo.ip,
      code: row.geo.country_code,
      country: row.geo.country,
      place: [row.geo.country, row.geo.city].filter(Boolean).join(" · "),
      sites: [],
    };
    entry.sites.push(row);
    groups.set(row.geo.ip, entry);
  }
  const blocked = supported.filter(
    (row) => !row.query.data && !row.query.isPending && !row.query.isFetching,
  ).length;
  const pendingSplit = supported.filter(
    (row) => row.query.isPending || row.query.isFetching,
  ).length;
  const domesticIp = data.domestic.data?.ip;
  const palette = [
    "var(--lime)",
    "var(--cyan)",
    "var(--violet)",
    "var(--warning)",
  ];
  const segments = [...groups.values()]
    .sort((a, b) => b.sites.length - a.sites.length)
    .slice(0, 4)
    .map((group, index) => ({
      ...group,
      color: palette[index],
      title:
        group.ip === domesticIp
          ? t("国内直连")
          : group.code === "CN"
            ? t("国内出口")
            : t("海外出口"),
    }));
  const other = [...groups.values()]
    .sort((a, b) => b.sites.length - a.sites.length)
    .slice(4)
    .reduce((sum, group) => sum + group.sites.length, 0);
  const total = supported.length;
  const circumference = 2 * Math.PI * 52;
  let offset = 0;
  const arcs = [
    ...segments.map((segment) => ({
      color: segment.color,
      count: segment.sites.length,
    })),
    { color: "var(--subtle)", count: other },
    { color: "var(--danger)", count: blocked },
  ].filter((arc) => arc.count > 0);
  const read = total - blocked - pendingSplit;
  return (
    <section aria-labelledby="home-latency">
      <SectionHead
        id="home-latency"
        title={t("连通性与分流")}
        tag="LATENCY · ROUTING"
        link={{ to: "/network/connectivity/", label: t("网络检测 ›") }}
      />
      <div className="v2-grid">
        <div className="v2-card v2-span-7">
          <div className="v2-card-head">
            <h3 className="v2-panel-title">{t("站点延迟")}</h3>
            <span className="v2-chart-legend">
              <span className="v2-pill ok">{t("网站")}</span>
              <span className="v2-pill cy">AI</span>
            </span>
            <span className="v2-label">ms · {t("单次中位数")}</span>
          </div>
          <div className="v2-chart" role="list">
            {bars.map((bar) => {
              const ok = bar.latency != null && bar.latency >= 0;
              const height = ok
                ? Math.max(4, Math.sqrt(bar.latency! / max) * 92)
                : bar.pending
                  ? 18
                  : 92;
              return (
                <div
                  className="v2-col"
                  key={bar.key}
                  role="listitem"
                  aria-label={`${bar.name} ${ok ? `${bar.latency} ms` : bar.pending ? t("检测中") : t("未连通")}`}
                >
                  <span
                    style={{
                      color: ok
                        ? undefined
                        : bar.pending
                          ? undefined
                          : "var(--danger)",
                    }}
                  >
                    {ok ? bar.latency : bar.pending ? "···" : "✗"}
                  </span>
                  <i
                    className={ok ? "" : bar.pending ? "pending" : "fail"}
                    style={
                      {
                        height: `${height}%`,
                        "--c":
                          bar.kind === "ai" ? "var(--cyan)" : "var(--lime)",
                      } as CSSProperties
                    }
                  />
                </div>
              );
            })}
          </div>
          <div className="v2-chart-x">
            {bars.map((bar) => (
              <Link key={bar.key} to={bar.to} title={bar.name}>
                {bar.logo}
                <span>{bar.name}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="v2-card v2-span-6">
          <div className="v2-card-head">
            <h3 className="v2-panel-title">{t("网站分流出口")}</h3>
            <Link to="/network/exits" className="v2-label">
              {t("{0} 站点 ›", [total])}
            </Link>
          </div>
          <div className="v2-donut">
            <svg
              viewBox="0 0 140 140"
              role="img"
              aria-label={t("{0}/{1} 个站点已读取出口", [read, total])}
            >
              <circle
                cx="70"
                cy="70"
                r="52"
                stroke="var(--hairline)"
                strokeWidth="14"
              />
              {arcs.map((arc, index) => {
                const length = (arc.count / Math.max(1, total)) * circumference;
                const element = (
                  <circle
                    key={index}
                    cx="70"
                    cy="70"
                    r="52"
                    stroke={arc.color}
                    strokeWidth="14"
                    strokeDasharray={`${Math.max(0, length - 2)} ${circumference}`}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 70 70)"
                  />
                );
                offset += length;
                return element;
              })}
              <g className="v2-donut-center">
                <text
                  x="70"
                  y="72"
                  textAnchor="middle"
                  style={{
                    font: "700 26px var(--font-mono)",
                    fill: "var(--foreground)",
                  }}
                >
                  {groups.size}
                </text>
                <text x="70" y="90" textAnchor="middle">
                  {t("个出口")}
                </text>
              </g>
            </svg>
            <div className="v2-donut-legend">
              {segments.map((segment) => (
                <div
                  key={segment.ip}
                  style={{ "--c": segment.color } as CSSProperties}
                >
                  <b>
                    <span>
                      <CountryFlag code={segment.code} /> {segment.title}
                    </span>
                    <em>{segment.sites.length}</em>
                  </b>
                  <span>
                    {maskedIp(segment.ip, hidden)}
                    {segment.place ? ` · ${segment.place}` : ""}
                  </span>
                </div>
              ))}
              {blocked > 0 && (
                <div style={{ "--c": "var(--danger)" } as CSSProperties}>
                  <b>
                    <span>{t("未读取")}</span>
                    <em>{blocked}</em>
                  </b>
                  <span>{t("跨域受限或超时")}</span>
                </div>
              )}
              {pendingSplit > 0 && !segments.length && (
                <Pending>{t("正在读取各网站出口…")}</Pending>
              )}
            </div>
          </div>
          <div className="v2-chips">
            {segments.flatMap((segment) =>
              segment.sites.slice(0, segments.length > 2 ? 3 : 5).map((row) => (
                <span
                  key={row.site.name}
                  style={{ "--c": segment.color } as CSSProperties}
                >
                  <i />
                  <img
                    src={row.site.icon}
                    alt=""
                    loading="lazy"
                    width="13"
                    height="13"
                  />
                  {row.site.name}
                </span>
              )),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- AI + services */
export function AiSection({ data }: { data: HomeData }) {
  const featured = featuredServiceIds
    .map((id) => ({
      id,
      service: services.find((service) => service.id === id)!,
      query: data.statusById.get(id)!,
    }))
    .sort(
      (a, b) =>
        statusOrder(a.query?.data?.status?.indicator) -
        statusOrder(b.query?.data?.status?.indicator),
    );
  const ok = data.aiOutcomes.filter(aiReachable).length;
  return (
    <section aria-labelledby="home-ai">
      <div className="v2-section-head">
        <h2 id="home-ai">{t("AI 与服务")}</h2>
        <span className="v2-label">AI REACHABILITY · STATUS</span>
        <Link to="/ai/">{t("AI 检测 ›")}</Link>
      </div>
      <div className="v2-grid">
        <div className="v2-card v2-span-8">
          <div className="v2-card-head">
            <h3 className="v2-panel-title">{t("AI 访问矩阵")}</h3>
            <span className="v2-label">
              {ok} / {data.aiOutcomes.length} {t("可访问")}
            </span>
          </div>
          <div className="v2-table-wrap">
            <table className="v2-table">
              <thead>
                <tr>
                  <th>{t("服务")}</th>
                  <th>{t("连通")}</th>
                  <th>{t("延迟")}</th>
                  <th className="v2-hide-mobile">{t("官方状态")}</th>
                  <th className="v2-hide-mobile">{t("服务地区")}</th>
                </tr>
              </thead>
              <tbody>
                {aiPlatforms.map((platform, index) => {
                  const outcome = data.aiOutcomes[index];
                  const reachable = aiReachable(outcome);
                  const indicator = outcome.indicator;
                  const statusQuery = data.statusById.get(platform.statusId);
                  return (
                    <tr
                      key={platform.id}
                      data-failed={outcome.settled && !reachable}
                    >
                      <td>
                        <Link to={`/ai/${platform.id}`} className="v2-name">
                          <SiteLogo website={`https://${platform.domain}`} />
                          {platform.name}
                        </Link>
                      </td>
                      <td title={outcome.description}>
                        {!outcome.settled ? (
                          <span className="v2-pill">{t("检测中")}</span>
                        ) : reachable ? (
                          <span className="v2-pill ok">{t("可访问")}</span>
                        ) : outcome.status === "restricted" ? (
                          <span className="v2-pill warn">{t("检测受限")}</span>
                        ) : (
                          <span className="v2-pill bad">{t("未连通")}</span>
                        )}
                      </td>
                      <td className="v2-num">
                        {reachable ? (
                          <span className="v2-latency">
                            <i
                              style={
                                {
                                  width: `${Math.max(6, Math.min(80, (outcome.latency! / 800) * 80))}px`,
                                  "--c": latencyColor(outcome.latency),
                                } as CSSProperties
                              }
                            />
                            {outcome.latency} ms
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="v2-hide-mobile">
                        <span
                          className="v2-status"
                          style={
                            { "--c": statusColor(indicator) } as CSSProperties
                          }
                        >
                          <i />
                          {statusQuery?.isPending
                            ? t("查询中")
                            : (statusLabels[indicator ?? ""] ?? t("待确认"))}
                        </span>
                      </td>
                      <td className="v2-num v2-hide-mobile">
                        {platform.domestic ? t("中国") : t("美国")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="v2-note">
            {t(
              "显示本次探测资源的 HTTP 响应耗时；未连通表示本次探测失败。点击平台可查看详情并打开官网。",
            )}
          </p>
        </div>
        <div className="v2-card v2-span-4">
          <div className="v2-card-head">
            <h3 className="v2-panel-title">{t("服务状态")}</h3>
            <Link to="/status/" className="v2-label">
              {t("全部服务 ›")}
            </Link>
          </div>
          <div>
            {featured.map(({ id, service, query }) => {
              const indicator = query?.data?.status?.indicator;
              return (
                <Link
                  key={id}
                  to={`/status?service=${id}`}
                  className="v2-status-row"
                >
                  <SiteLogo
                    src={service.icon ?? undefined}
                    website={service.page}
                  />
                  <span>{service.name.replace(" (Anthropic)", "")}</span>
                  <span
                    className="v2-status"
                    style={{ "--c": statusColor(indicator) } as CSSProperties}
                  >
                    <i />
                    {query?.isPending
                      ? t("查询中")
                      : (statusLabels[indicator ?? ""] ?? t("待确认"))}
                  </span>
                </Link>
              );
            })}
          </div>
          <p className="v2-note">
            {t("来自官方状态源；点击服务查看组件与事件。")}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------- Browser + tools */
export function BrowserToolsSection() {
  const tools = [
    {
      path: "/ai/claude",
      label: t("Claude 中国用户检测"),
      description: t("检查语言、时区与设备信号"),
      icon: () => <SiteLogo website="https://claude.ai" />,
    },
    {
      path: "/network/exits",
      label: t("分流出口"),
      description: t("核对不同网站的实际出口"),
      icon: Network,
    },
    {
      path: "/browser/challenges",
      label: t("人机检测"),
      description: t("体验验证码，查看验证结果"),
      icon: ShieldCheck,
    },
    {
      path: "/browser/consistency",
      label: t("环境一致性"),
      description: t("核对浏览器环境与设备信号"),
      icon: Search,
    },
    {
      path: "/browser/fingerprint",
      label: t("浏览器指纹"),
      description: t("查看指纹组成与变化"),
      icon: Fingerprint,
    },
    {
      path: "/status/",
      label: t("服务状态"),
      description: t("查看平台故障与服务动态"),
      icon: Activity,
    },
  ];
  return (
    <section aria-labelledby="home-tools">
      <div className="v2-section-head">
        <h2 id="home-tools">{t("浏览器与工具")}</h2>
        <span className="v2-label">ENVIRONMENT · TOOLS</span>
      </div>
      <div className="v2-grid">
        <div className="v2-span-6 v2-browser">
          <BrowserSummary />
        </div>
        <div className="v2-card v2-span-6">
          <div className="v2-card-head">
            <h3 className="v2-panel-title">{t("热门功能")}</h3>
          </div>
          <nav className="v2-tools" aria-label={t("热门功能")}>
            {tools.map((tool) => (
              <Link key={tool.path} to={tool.path}>
                <span className="v2-tool-icon">
                  <tool.icon aria-hidden="true" />
                </span>
                <span>
                  <b>{tool.label}</b>
                  <small>{tool.description}</small>
                </span>
                <ArrowUpRight aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}
