import type { RoutePoint } from './routePath';

/**
 * The routes in the generated file (`trafficRoutes.json`), checked and grouped
 * by kind. A bad export must not reach the traffic silently: a route whose
 * name has no known prefix throws, because a typo in Blender would otherwise
 * leave a route without traffic and nobody would notice.
 *
 * Pure: the file arrives as data, so the generated file itself is tested.
 */
export function readTrafficRoutes(
  file: unknown,
  prefixes: readonly string[],
): Map<string, { name: string; points: RoutePoint[] }[]> {
  const routes = (file as { routes?: unknown } | null)?.routes;
  if (!routes || typeof routes !== 'object') throw new Error('[traffic] routes file has no "routes" object');
  const out = new Map<string, { name: string; points: RoutePoint[] }[]>(prefixes.map((prefix) => [prefix, []]));
  for (const [name, points] of Object.entries(routes)) {
    const prefix = prefixes.find((candidate) => name.startsWith(candidate));
    if (prefix === undefined) {
      throw new Error(`[traffic] route "${name}" starts with none of ${prefixes.join(', ')}`);
    }
    if (
      !Array.isArray(points) ||
      points.length < 2 ||
      !points.every((p) => Array.isArray(p) && p.length === 3 && p.every((c) => Number.isFinite(c)))
    ) {
      throw new Error(`[traffic] route "${name}" is not a list of at least two [x, y, z] points`);
    }
    out.get(prefix)!.push({ name, points: points as RoutePoint[] });
  }
  return out;
}
