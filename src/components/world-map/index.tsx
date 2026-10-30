import { useId, useLayoutEffect, useRef, useState } from "react";
import { MAP_HEIGHT, MAP_WIDTH } from "./frame.ts";
import { GRATICULE_PATH, LAND_PATH } from "./geometry.ts";
import { project } from "./projection.ts";

export type MapTone = "you" | "ok" | "fail" | "egress" | "alt" | "muted";
export interface MapNode {
  id: string;
  lon: number;
  lat: number;
  label?: string;
  sub?: string;
  tone: MapTone;
  size?: "lg" | "md" | "sm";
}
export interface MapRoute {
  from: string;
  to: string;
  tone: MapTone;
  dashed?: boolean;
}
export type MapView =
  | { mode: "world"; offset?: number; span?: number }
  | { mode: "fit"; minSpan?: number; pad?: number };

/* A light-weight decorative "network" of major interconnection cities. */
const CITIES: Record<string, [number, number]> = {
  lon: [-0.12, 51.5],
  fra: [8.68, 50.11],
  par: [2.35, 48.86],
  mos: [37.6, 55.75],
  ist: [28.98, 41],
  cai: [31.24, 30.04],
  dxb: [55.27, 25.2],
  bom: [72.88, 19.08],
  del: [77.2, 28.6],
  bkk: [100.5, 13.75],
  sg: [103.82, 1.35],
  jkt: [106.85, -6.2],
  hk: [114.17, 22.32],
  tpe: [121.56, 25.03],
  sh: [121.47, 31.23],
  bj: [116.4, 39.9],
  sel: [126.98, 37.57],
  tyo: [139.69, 35.69],
  syd: [151.2, -33.87],
  per: [115.86, -31.95],
  akl: [174.76, -36.85],
  hnl: [-157.86, 21.3],
  anc: [-149.9, 61.2],
  sea: [-122.33, 47.6],
  sf: [-122.42, 37.77],
  la: [-118.24, 34.05],
  mex: [-99.13, 19.43],
  chi: [-87.63, 41.88],
  yyz: [-79.38, 43.65],
  nyc: [-74, 40.71],
  va: [-77.5, 39],
  mia: [-80.19, 25.76],
  gru: [-46.63, -23.55],
  scl: [-70.65, -33.45],
  jnb: [28.05, -26.2],
  los: [3.38, 6.52],
};
const MESH =
  "lon-fra lon-par fra-mos fra-ist ist-dxb dxb-bom bom-del del-bkk bom-sg bkk-sg sg-jkt sg-hk hk-tpe tpe-sh sh-bj bj-sel sel-tyo tyo-sh hk-sh jkt-per per-syd syd-akl sg-syd tyo-hnl hnl-la tyo-sea tyo-anc anc-sea sea-sf sf-la la-mex sf-chi chi-yyz chi-nyc nyc-va va-mia mia-gru gru-scl nyc-lon va-lon gru-jnb jnb-los los-lon cai-ist cai-jnb dxb-cai syd-la akl-scl hk-sf sg-la mos-bj del-sh"
    .split(" ")
    .map((pair) => pair.split("-"));

type Point = [number, number];
function control(a: Point, b: Point, bend: number): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1;
  let nx = -dy / d;
  let ny = dx / d;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return [(a[0] + b[0]) / 2 + nx * d * bend, (a[1] + b[1]) / 2 + ny * d * bend];
}
const fixed = (value: number) => Math.round(value * 10) / 10;
function arc(a: Point, b: Point, bend: number) {
  const c = control(a, b, bend);
  return `M${fixed(a[0])} ${fixed(a[1])}Q${fixed(c[0])} ${fixed(c[1])} ${fixed(b[0])} ${fixed(b[1])}`;
}
const meshPath = MESH.flatMap(([from, to]) => {
  const a = project(...CITIES[from]);
  const b = project(...CITIES[to]);
  return Math.abs(a[0] - b[0]) > MAP_WIDTH * 0.6 ? [] : [arc(a, b, 0.18)];
}).join("");
const cityPoints = Object.values(CITIES).map(([lon, lat]) => project(lon, lat));

/** Rough text width in em for CJK + latin labels. */
function textWidth(text: string) {
  let width = 0;
  for (const char of text)
    width += /[\u3000-\u9fff\uff00-\uffef✓✗]/.test(char)
      ? 1
      : /[A-Z]/.test(char)
        ? 0.66
        : /[\s·.:]/.test(char)
          ? 0.32
          : 0.56;
  return width;
}

function viewBox(
  view: MapView,
  points: Point[],
  aspect: number,
): [number, number, number, number] {
  if (view.mode === "world") {
    const span = view.span ?? MAP_WIDTH;
    const w = span;
    let h = w / aspect;
    let x = -(view.offset ?? 0) * span;
    if (h > MAP_HEIGHT * 0.96) {
      // Very tall containers: zoom in instead of showing empty poles.
      h = MAP_HEIGHT * 0.96;
      const w2 = h * aspect;
      x += (w - w2) / 2;
      return [x, (MAP_HEIGHT - h) / 2 + 8, w2, h];
    }
    // Keep the populated latitudes (≈70°N – 45°S) in frame.
    const center = 205;
    return [x, Math.max(0, Math.min(MAP_HEIGHT - h, center - h / 2)), w, h];
  }
  const pad = view.pad ?? 70;
  const minSpan = view.minSpan ?? 300;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad;
  const x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad * 1.2;
  const y1 = Math.max(...ys) + pad * 0.7;
  let w = Math.max(x1 - x0, (y1 - y0) * aspect, minSpan);
  let h = w / aspect;
  if (h > MAP_HEIGHT) {
    h = MAP_HEIGHT;
    w = h * aspect;
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [
    cx - w / 2,
    Math.max(-20, Math.min(MAP_HEIGHT - h + 20, cy - h / 2)),
    w,
    h,
  ];
}

export function WorldMap({
  nodes,
  routes,
  view,
  label,
  className = "",
  labelSize = 12,
  safeLeft = 0,
}: {
  nodes: MapNode[];
  routes: MapRoute[];
  view: MapView;
  label: string;
  className?: string;
  labelSize?: number;
  /** Fraction of the width covered by an overlay; labels avoid it. */
  safeLeft?: number;
}) {
  const id = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number]>([1200, 480]);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0)
        setSize((previous) =>
          Math.abs(previous[0] - width) < 1 &&
          Math.abs(previous[1] - height) < 1
            ? previous
            : [width, height],
        );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const positioned = nodes.map((node) => ({
    ...node,
    point: project(node.lon, node.lat),
  }));
  const byId = new Map(positioned.map((node) => [node.id, node]));
  const [vx, vy, vw, vh] = viewBox(
    view,
    positioned.length
      ? positioned.map((node) => node.point)
      : [project(116, 32)],
    size[0] / size[1],
  );
  const unit = vw / size[0]; // viewBox units per CSS pixel
  const fontSize = labelSize * unit;

  // Greedy label placement that avoids overlapping earlier labels.
  const placed: [number, number, number, number][] = [];
  const labels = positioned.flatMap((node) => {
    if (!node.label) return [];
    const subSize = fontSize * 0.84;
    const width =
      Math.max(
        textWidth(node.label) * fontSize,
        (node.sub?.length ?? 0) * subSize * 0.62,
      ) +
      fontSize * 1.6;
    const height = node.sub ? fontSize * 3 : fontSize * 2;
    const gap = fontSize * 1.1;
    const [x, y] = node.point;
    const candidates: [number, number][] = [
      [x + gap, y - height - gap * 0.3],
      [x + gap, y + gap * 0.3],
      [x - gap - width, y - height - gap * 0.3],
      [x - gap - width, y + gap * 0.3],
      [x - width / 2, y - height - gap * 1.2],
      [x - width / 2, y + gap * 1.2],
    ];
    const score = ([lx, ly]: [number, number]) => {
      let penalty = 0;
      for (const [ax, ay, aw, ah] of placed) {
        const ox = Math.max(
          0,
          Math.min(lx + width, ax + aw) - Math.max(lx, ax),
        );
        const oy = Math.max(
          0,
          Math.min(ly + height, ay + ah) - Math.max(ly, ay),
        );
        penalty += ox * oy;
      }
      for (const other of positioned) {
        if (other === node) continue;
        const [px, py] = other.point;
        if (px > lx && px < lx + width && py > ly && py < ly + height)
          penalty += width * height * 0.5;
      }
      if (lx < vx || lx + width > vx + vw) penalty += width * height * 2;
      if (lx < vx + vw * safeLeft) penalty += width * height * 1.5;
      if (ly < vy || ly + height > vy + vh) penalty += width * height * 2;
      return penalty;
    };
    let best = candidates[0];
    let bestScore = Infinity;
    for (const candidate of candidates) {
      const value = score(candidate);
      if (value < bestScore - 1e-6) {
        best = candidate;
        bestScore = value;
      }
    }
    placed.push([best[0], best[1], width, height]);
    return [{ node, x: best[0], y: best[1], width, height, subSize }];
  });

  const routeShapes = routes.flatMap((route, index) => {
    const from = byId.get(route.from);
    const to = byId.get(route.to);
    if (!from || !to) return [];
    const distance = Math.hypot(
      to.point[0] - from.point[0],
      to.point[1] - from.point[1],
    );
    if (distance < 2) return [];
    const bend = distance < 60 ? 0.45 : distance < 200 ? 0.32 : 0.22;
    return [
      {
        ...route,
        key: `${route.from}-${route.to}-${index}`,
        d: arc(from.point, to.point, bend),
        a: from.point,
        b: to.point,
        index,
      },
    ];
  });
  const lw = unit; // one CSS pixel in viewBox units
  return (
    <div ref={box} className={`world-map ${className}`}>
      <svg
        viewBox={`${fixed(vx)} ${fixed(vy)} ${fixed(vw)} ${fixed(vh)}`}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={label}
        focusable="false"
      >
        <defs>
          <filter id={`${id}-soft`} x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation={1.2 * lw} />
          </filter>
          <filter
            id={`${id}-haze`}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation={8 * lw} />
          </filter>
          <filter
            id={`${id}-glow`}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation={2.6 * lw} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id={`${id}-fade`} cx="0.5" cy="0.5" r="0.62">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask
            id={`${id}-mask`}
            maskUnits="userSpaceOnUse"
            x={vx}
            y={vy}
            width={vw}
            height={vh}
          >
            <rect
              x={vx}
              y={vy}
              width={vw}
              height={vh}
              fill={`url(#${id}-fade)`}
            />
          </mask>
          {routeShapes.map((route) => (
            <linearGradient
              key={route.key}
              id={`${id}-g${route.index}`}
              gradientUnits="userSpaceOnUse"
              x1={route.a[0]}
              y1={route.a[1]}
              x2={route.b[0]}
              y2={route.b[1]}
            >
              <stop
                offset="0"
                className={`wm-stop-${route.tone}`}
                stopOpacity="0.2"
              />
              <stop offset="1" className={`wm-stop-${route.tone}`} />
            </linearGradient>
          ))}
        </defs>
        <g mask={`url(#${id}-mask)`} aria-hidden="true">
          <path
            className="wm-land-haze"
            d={LAND_PATH}
            filter={`url(#${id}-haze)`}
          />
          <path className="wm-land" d={LAND_PATH} filter={`url(#${id}-soft)`} />
          <path className="wm-coast" d={LAND_PATH} strokeWidth={0.7 * lw} />
          <path
            className="wm-graticule"
            d={GRATICULE_PATH}
            strokeWidth={0.6 * lw}
            strokeDasharray={`${2 * lw} ${4 * lw}`}
          />
          <path className="wm-mesh" d={meshPath} strokeWidth={0.9 * lw} />
          {cityPoints.map(([x, y], index) => (
            <g key={index} className="wm-city">
              <circle cx={x} cy={y} r={5 * lw} className="wm-city-halo" />
              <circle cx={x} cy={y} r={1.7 * lw} />
            </g>
          ))}
        </g>
        <g aria-hidden="true">
          {routeShapes.map((route) => (
            <g key={route.key} className={`wm-route wm-tone-${route.tone}`}>
              <path
                className="wm-route-glow"
                d={route.d}
                strokeWidth={7 * lw}
                filter={`url(#${id}-soft)`}
              />
              <path
                className="wm-route-line"
                d={route.d}
                stroke={`url(#${id}-g${route.index})`}
                strokeWidth={2 * lw}
                strokeDasharray={
                  route.dashed ? `${6 * lw} ${6 * lw}` : undefined
                }
                filter={`url(#${id}-glow)`}
              />
              {!route.dashed && (
                <path
                  className="wm-route-trail"
                  d={route.d}
                  pathLength={100}
                  strokeWidth={3 * lw}
                  style={{ animationDelay: `${-route.index * 0.9}s` }}
                />
              )}
            </g>
          ))}
          {positioned.map((node) => {
            const r =
              (node.size === "lg" ? 6.5 : node.size === "sm" ? 3.5 : 4.8) * lw;
            const [x, y] = node.point;
            return (
              <g key={node.id} className={`wm-node wm-tone-${node.tone}`}>
                <circle cx={x} cy={y} r={r * 3.4} className="wm-node-halo" />
                {node.tone === "you" && (
                  <circle cx={x} cy={y} r={r * 2} className="wm-node-pulse" />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={r * 2}
                  className="wm-node-ring"
                  strokeWidth={lw}
                />
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  className="wm-node-core"
                  filter={`url(#${id}-glow)`}
                />
                <circle cx={x} cy={y} r={r * 0.42} className="wm-node-dot" />
              </g>
            );
          })}
          {labels.map(({ node, x, y, width, height, subSize }) => (
            <g key={node.id} className={`wm-label wm-tone-${node.tone}`}>
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx={height / 2.6}
                strokeWidth={lw}
              />
              <text
                x={x + fontSize * 0.8}
                y={y + fontSize * 1.32}
                fontSize={fontSize}
                className="wm-label-title"
              >
                {node.label}
              </text>
              {node.sub && (
                <text
                  x={x + fontSize * 0.8}
                  y={y + fontSize * 2.5}
                  fontSize={subSize}
                  className="wm-label-sub"
                >
                  {node.sub}
                </text>
              )}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
export default WorldMap;
