import { useEffect } from "react";
import { t } from "@/i18n";
import { HomeHero } from "./hero";
import {
  AiSection,
  BrowserToolsSection,
  EgressSection,
  LatencySection,
} from "./sections";
import { useHomeData, useRefresh } from "./use-home-data";

export function HomePage() {
  const { refresh, refreshing } = useRefresh();
  const data = useHomeData();
  useEffect(() => {
    document.title = t("概览 - IP 网络工具");
  }, []);
  return (
    <div className="v2-home">
      <HomeHero data={data} refresh={refresh} refreshing={refreshing} />
      <EgressSection data={data} />
      <LatencySection data={data} />
      <AiSection data={data} />
      <BrowserToolsSection />
    </div>
  );
}
export default HomePage;
