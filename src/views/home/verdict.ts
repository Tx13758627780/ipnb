import { t } from "@/i18n";

export interface AiOutcome {
  id: string;
  name: string;
  /** null while the probe is still running. */
  latency: number | null | undefined;
  settled: boolean;
  status?: "response" | "restricted" | "unknown";
  description?: string;
  /** Official status indicator (statuspage "none" | "minor" | …). */
  indicator?: string;
}
export type VerdictTone = "checking" | "good" | "warn" | "bad";
export interface Verdict {
  tone: VerdictTone;
  ok: number;
  settled: number;
  total: number;
  title: string;
  failing: { id: string; name: string; reason: string; detail?: string }[];
}

const indicatorLabels: Record<string, string> = {
  minor: "轻微故障",
  major: "严重故障",
  critical: "重大故障",
  maintenance: "维护中",
};

export const aiReachable = (outcome: AiOutcome) =>
  outcome.settled && outcome.latency != null && outcome.latency >= 0;

/** One-sentence diagnosis computed from the real AI probe results. */
export function aiVerdict(outcomes: AiOutcome[]): Verdict {
  const total = outcomes.length;
  const settled = outcomes.filter((outcome) => outcome.settled).length;
  const ok = outcomes.filter(aiReachable).length;
  const failing: Verdict["failing"] = outcomes
    .filter((outcome) => outcome.settled && !aiReachable(outcome))
    .map((outcome) => ({
      id: outcome.id,
      name: outcome.name,
      reason:
        outcome.status === "restricted"
          ? t("检测受限 · 站点防护阻止了浏览器探测")
          : t("未连通 · 3 秒内无有效响应"),
      detail: outcome.description,
    }));
  for (const outcome of outcomes) {
    const label = outcome.indicator && indicatorLabels[outcome.indicator];
    if (!label) continue;
    const reason = t("官方状态：{0}", [t(label)]);
    const existing = failing.find((item) => item.id === outcome.id);
    if (existing) existing.reason = `${reason} · ${existing.reason}`;
    else failing.push({ id: outcome.id, name: outcome.name, reason });
  }
  if (!total || settled < total)
    return {
      tone: "checking",
      ok,
      settled,
      total,
      title: t("正在诊断 AI 服务可用性…"),
      failing,
    };
  const ratio = ok / total;
  const [tone, title]: [VerdictTone, string] =
    ok === total
      ? ["good", t("网络良好，全部 AI 可直接使用")]
      : ratio >= 0.75
        ? ["good", t("网络良好，大部分 AI 可直接使用")]
        : ratio >= 0.4
          ? ["warn", t("部分 AI 服务无法访问")]
          : ok > 0
            ? ["bad", t("大部分 AI 服务无法直接访问")]
            : ["bad", t("AI 服务均无法访问")];
  return { tone, ok, settled, total, title, failing };
}

/** Shared latency colour scale for the overview (✗ / <150 / <400 / slow). */
export function latencyColor(latency?: number | null) {
  return latency == null || latency < 0
    ? "var(--danger)"
    : latency < 150
      ? "var(--lime)"
      : latency < 400
        ? "var(--cyan)"
        : "var(--warning)";
}
