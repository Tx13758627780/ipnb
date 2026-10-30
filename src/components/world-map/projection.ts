import { MAP_CENTER, MAP_SCALE, MAP_TRANSLATE } from "./frame.ts";

const radians = Math.PI / 180;

/** Natural Earth 1 projection matching the pre-baked land geometry. */
export function project(lon: number, lat: number): [number, number] {
  let lambda = (((lon - MAP_CENTER + 540) % 360) - 180) * radians;
  if (lambda <= -Math.PI) lambda += 2 * Math.PI;
  const phi = Math.max(-90, Math.min(90, lat)) * radians;
  const phi2 = phi * phi;
  const phi4 = phi2 * phi2;
  const x =
    lambda *
    (0.8707 -
      0.131979 * phi2 +
      phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4)));
  const y =
    phi *
    (1.007226 +
      phi2 *
        (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
  return [MAP_TRANSLATE[0] + MAP_SCALE * x, MAP_TRANSLATE[1] - MAP_SCALE * y];
}

export function validCoordinate(lat?: number, lon?: number) {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}
