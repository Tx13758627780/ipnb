import { useState } from "react";
import { homeTargets } from "@/components/connectivity";
import { t } from "@/i18n";
import type { Geo } from "@/lib/types";
import { aiPlatforms } from "@/views/ai/platforms";
import { probeAiDomain } from "@/views/ai/probe";
import { lookupIp } from "@/views/ip/api";
import { testConnectivity, type ProbeResult } from "@/views/link/api";
import { getStatus } from "@/views/status/api";
import rawservices from "@/views/status/services.json";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { detectSite, getBrowserIp, getDomesticIp, getGeo } from "./api";
import { egressCards, isHomeQuery } from "./egress";
import rawsites from "./sites.json";
import type { AiOutcome } from "./verdict";

export const services = rawservices.map((item) => ({
  ...item,
  name: t(item.name),
  note: item.note ? t(item.note) : item.note,
}));
export const featuredServiceIds = ["9", "4", "10", "5", "0", "19", "15", "1"];
export const splitSites = rawsites.map((item) => ({
  ...item,
  name: t(item.name),
}));

export function useRefresh() {
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    const filters = {
      predicate: (query: { queryKey: readonly unknown[] }) =>
        isHomeQuery(query.queryKey),
    };
    try {
      await client.cancelQueries(filters);
      await client.resetQueries(filters);
    } finally {
      setRefreshing(false);
    }
  };
  return { refresh, refreshing };
}

const base = { retry: false, staleTime: 60_000 } as const;

/** Every live data source the overview needs, sharing cache keys with the tool pages. */
export function useHomeData() {
  const client = useQueryClient();
  const connectivity = useQueries({
    queries: homeTargets.map((target) => ({
      ...base,
      queryKey: ["connectivity", target.url, 0],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        testConnectivity(target.url, signal, (result) =>
          client.setQueryData(["connectivity-progress", target.url, 0], result),
        ),
    })),
  });
  const probes = useQueries({
    queries: [
      {
        queryKey: ["home-domestic-ip", 3],
        queryFn: ({ signal }: { signal: AbortSignal }) => getDomesticIp(signal),
      },
      {
        queryKey: ["browser-ip", 4],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          getBrowserIp(4, signal),
      },
      {
        queryKey: ["browser-ip", 6],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          getBrowserIp(6, signal),
      },
    ].map((probe) => ({ ...base, ...probe })),
  });
  const [domestic, external4, external6] = probes;
  const cards = egressCards(domestic, external4, external6);
  const split = useQueries({
    queries: splitSites.map((site) => ({
      ...base,
      queryKey: ["split", site.name, 0],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        detectSite(site, signal),
    })),
  });
  const ips = [
    ...new Set([
      ...cards.map((card) => card.data!.ip),
      ...split.flatMap((query) => (query.data ? [query.data.ip] : [])),
    ]),
  ];
  const geoQueries = useQueries({
    queries: ips.map((ip) => ({
      ...base,
      queryKey: ["geoip", ip],
      queryFn: ({ signal }: { signal: AbortSignal }) => getGeo(ip, signal),
    })),
  });
  const geoByIp = new Map(ips.map((ip, index) => [ip, geoQueries[index]]));
  const geoOf = (geo?: Geo): Geo | undefined =>
    geo ? { ...geo, ...geoByIp.get(geo.ip)?.data } : undefined;
  const cardIps = cards.map((card) => card.data!.ip);
  const typeQueries = useQueries({
    queries: cardIps.map((ip) => ({
      queryKey: ["lookup-ip-coffee", ip],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        lookupIp(ip, AbortSignal.any([signal, AbortSignal.timeout(3000)])),
      staleTime: 3600_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });
  const typeByIp = new Map(
    cardIps.map((ip, index) => [ip, typeQueries[index]]),
  );
  const ai = useQueries({
    queries: aiPlatforms.map((platform) => ({
      queryKey: ["ai-preview", "v3", platform.id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        probeAiDomain(platform.domain, signal),
      staleTime: 120_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });
  const statusIds = [
    ...new Set([
      ...featuredServiceIds,
      ...aiPlatforms.map((platform) => platform.statusId),
    ]),
  ];
  const statusQueries = useQueries({
    queries: statusIds.map((id) => ({
      queryKey: ["service-status", id],
      queryFn: ({ signal }: { signal: AbortSignal }) => getStatus(id, signal),
      staleTime: 120_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });
  const statusById = new Map(
    statusIds.map((id, index) => [id, statusQueries[index]]),
  );
  const aiOutcomes: AiOutcome[] = aiPlatforms.map((platform, index) => {
    const query = ai[index];
    return {
      id: platform.id,
      name: platform.name,
      latency: query.data?.median,
      settled: !query.isFetching && (query.isSuccess || query.isError),
      status: query.data?.status,
      description: query.data?.description,
      indicator: statusById.get(platform.statusId)?.data?.status?.indicator,
    };
  });
  const connectivityResults = homeTargets.map((target, index) => ({
    target,
    query: connectivity[index],
    result: connectivity[index].data as ProbeResult | undefined,
  }));
  const splitRows = splitSites.map((site, index) => ({
    site,
    query: split[index],
    geo: geoOf(split[index].data),
  }));
  const serviceName = (id: string) =>
    services
      .find((service) => service.id === id)
      ?.name.replace(" (Anthropic)", "") ?? id;
  return {
    serviceName,
    cards: cards.map((card) => ({ ...card, geo: geoOf(card.data) })),
    domesticGeo: geoOf(domestic.data),
    domestic,
    geoByIp,
    typeByIp,
    aiOutcomes,
    aiQueries: ai,
    statusById,
    connectivityResults,
    splitRows,
  };
}
export type HomeData = ReturnType<typeof useHomeData>;
