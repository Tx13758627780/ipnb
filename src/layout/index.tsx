import { lazy, Suspense, useEffect, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BrandMark } from "@/components/brand-mark";
import { BuildInfo } from "@/components/build-info";
import { LanguageSelect } from "@/components/language-select";
import { AppUpdateChecker } from "@/components/providers/app-update-checker";
import { ShareSite } from "@/components/share-site";
import { ThemeToggleButton } from "@/components/theme/theme-toggle-button";
import { Pending } from "@/components/toolkit";
import { AnimatedSegmentedTabs } from "@/components/ui/animated-segmented-tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { UnderlineHover } from "@/components/underline-hover";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/hooks/use-theme";
import { t } from "@/i18n";
import { Search, Globe, Cable, Activity, Sparkles } from "lucide-react";
import { Tabs } from "radix-ui";
import { Toaster } from "sonner";
import { RouteErrorBoundary } from "./route-error-boundary";
import { activeNavigationRoute, navigationRoutes, toolGroups } from "./routes";

const MobileNavGlass = lazy(() => import("@/components/mobile-nav-glass"));

const menuIcons = {
  "/": Search,
  "/browser/": Globe,
  "/network/": Cable,
  "/ai/": Sparkles,
  "/status/": Activity,
};

const options = navigationRoutes.map((route) => {
  const Icon = menuIcons[route.value];
  return {
    value: route.value,
    label: (
      <>
        <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
        <span className="nav-full">{route.label}</span>
        <span className="nav-short">{route.short}</span>
      </>
    ),
  };
});

const allTools = Object.values(toolGroups).flat();

/** Visual page title derived from the route; the accessible h1 stays in PageHeading. */
function routeHeading(pathname: string, activeRoute: string) {
  if (activeRoute === "/") return null;
  const section = navigationRoutes.find((route) => route.value === activeRoute);
  if (!section) return null;
  const path = pathname.replace(/\/+$/, "");
  const tool = allTools.find(
    (item) => path === item.path || path.startsWith(`${item.path}/`),
  );
  return { section: section.label, title: tool?.label ?? section.label };
}

export function AppLayout() {
  const { resolvedTheme } = useTheme();
  const mobile = useIsMobile();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);
  const activeRoute = activeNavigationRoute(pathname);
  const heading = routeHeading(pathname, activeRoute);

  useEffect(() => {
    window.scrollTo(0, 0);
    const viewport = navRef.current?.querySelector<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    );
    const trigger = navRef.current?.querySelector<HTMLElement>(
      "[role=tab][data-state=active]",
    );
    if (!viewport || !trigger) return;
    const parent = viewport.getBoundingClientRect();
    const child = trigger.getBoundingClientRect();
    const offset =
      child.left < parent.left
        ? child.left - parent.left - 8
        : child.right > parent.right
          ? child.right - parent.right + 8
          : 0;
    if (offset)
      viewport.scrollBy({
        left: offset,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [pathname]);

  return (
    <>
      <div className="app-backdrop" aria-hidden="true" />
      <div className="app-container">
        <header className="mobile-site-header">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-semibold"
            aria-label={t("ipnb 首页")}
          >
            <BrandMark />
            <span className="brand-wordmark">
              ip<b>nb</b>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <ShareSite />
            <LanguageSelect />
            <ThemeToggleButton className="size-8 rounded-full text-muted-foreground" />
          </div>
        </header>
        <AnimatedSegmentedTabs
          label={t("网络诊断工具")}
          options={options}
          value={activeRoute}
          onValueChange={(value) => {
            if (value !== activeRoute) navigate(value);
          }}
          activationMode="manual"
          className="min-w-0"
          listClassName="h-9 w-max justify-start gap-0.5 bg-transparent p-0"
          highlightClassName="rounded-lg bg-primary/10 shadow-none ring-0"
          triggerClassName="h-9 flex-none rounded-lg border-0 px-2 text-[13px] text-muted-foreground hover:bg-accent/50 data-[state=active]:font-semibold data-[state=active]:text-primary"
          renderList={(list) => (
            <nav ref={navRef} className="app-nav" aria-label={t("主导航")}>
              {mobile && (
                <Suspense fallback={null}>
                  <MobileNavGlass light={resolvedTheme === "light"} />
                </Suspense>
              )}
              <Link
                to="/"
                aria-label={t("ipnb 首页")}
                className="site-home-link flex size-9 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
              >
                <BrandMark />
                <span className="brand-wordmark">
                  ip<b>nb</b>
                </span>
              </Link>
              <ScrollArea className="nav-tabs-scroll">
                {list}
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              <div className="desktop-preferences flex items-center gap-1">
                <span className="nav-live" aria-hidden="true">
                  <span className="pulse-dot" />
                  {t("实时检测")}
                </span>
                <ShareSite />
                <LanguageSelect />
                <ThemeToggleButton className="size-9 shrink-0 rounded-lg text-muted-foreground" />
              </div>
            </nav>
          )}
        >
          <Tabs.Content value={activeRoute} asChild>
            <main className="outline-none">
              {heading && (
                <div className="route-heading" aria-hidden="true">
                  {heading.title !== heading.section && (
                    <span className="route-heading-section">
                      {heading.section}
                    </span>
                  )}
                  <span className="route-heading-title">{heading.title}</span>
                </div>
              )}
              <RouteErrorBoundary key={pathname}>
                <Suspense
                  fallback={
                    <p className="status-line">
                      <Pending>{t("正在加载页面…")}</Pending>
                    </p>
                  }
                >
                  <Outlet />
                </Suspense>
              </RouteErrorBoundary>
            </main>
          </Tabs.Content>
        </AnimatedSegmentedTabs>
        <footer className="app-footer">
          <div className="app-footer-inner">
            <span className="app-footer-brand">
              <BrandMark />
              <span>© {new Date().getFullYear()} ipnb · ipnb.online</span>
            </span>
            <nav className="app-footer-links" aria-label={t("使用文档")}>
              <UnderlineHover asChild>
                <a
                  href="https://github.com/Tx13758627780/ipnb#readme"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("使用文档")}
                </a>
              </UnderlineHover>
              <UnderlineHover asChild>
                <Link to="/docs/api">API</Link>
              </UnderlineHover>
              <UnderlineHover asChild>
                <Link to="/terms">{t("使用条款")}</Link>
              </UnderlineHover>
              <UnderlineHover asChild>
                <Link to="/privacy">{t("隐私政策")}</Link>
              </UnderlineHover>
              <UnderlineHover asChild>
                <a
                  href="https://github.com/Tx13758627780/ipnb"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </UnderlineHover>
              <UnderlineHover asChild>
                <a href="mailto:contact@ipnb.online">{t("联系作者")}</a>
              </UnderlineHover>
            </nav>
          </div>
        </footer>
      </div>
      <aside aria-label={t("站点通知")} className="update-notices">
        <AppUpdateChecker />
      </aside>
      <BuildInfo />
      <Toaster richColors theme={resolvedTheme} position="top-right" />
    </>
  );
}
