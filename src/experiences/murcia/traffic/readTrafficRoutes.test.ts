import { describe, expect, it } from 'vitest';
import { readTrafficRoutes } from './readTrafficRoutes';
import { createRoutePath } from './routePath';
import { TRAFFIC_KINDS } from './trafficConfig';
import trafficRoutes from './trafficRoutes.json';

const prefixes = ['ruta-naval-', 'ruta-vial-'];

describe('readTrafficRoutes', () => {
  it('groups routes by prefix', () => {
    const routes = readTrafficRoutes(
      {
        routes: {
          'ruta-naval-001': [
            [0, 0, 0],
            [1, 0, 0],
          ],
          'ruta-vial-001': [
            [0, 0, 0],
            [0, 0, 1],
          ],
        },
      },
      prefixes,
    );
    expect(routes.get('ruta-naval-')!.map((route) => route.name)).toEqual(['ruta-naval-001']);
    expect(routes.get('ruta-vial-')!.map((route) => route.name)).toEqual(['ruta-vial-001']);
  });

  it('throws on a route with an unknown prefix', () => {
    expect(() =>
      readTrafficRoutes(
        {
          routes: {
            'ruta-navl-001': [
              [0, 0, 0],
              [1, 0, 0],
            ],
          },
        },
        prefixes,
      ),
    ).toThrow(/ruta-navl-001/);
  });

  it('throws on a malformed route', () => {
    expect(() => readTrafficRoutes({ routes: { 'ruta-naval-001': [[0, 0, 0]] } }, prefixes)).toThrow();
    expect(() => readTrafficRoutes({ routes: { 'ruta-naval-001': [[0, 0], [1, 0]] } }, prefixes)).toThrow();
    expect(() => readTrafficRoutes({ routes: { 'ruta-naval-001': [[0, 0, NaN], [1, 0, 0]] } }, prefixes)).toThrow();
    expect(() => readTrafficRoutes({}, prefixes)).toThrow();
  });
});

describe('trafficRoutes.json', () => {
  it('reads, and every route builds a path for its kind', () => {
    const routes = readTrafficRoutes(
      trafficRoutes,
      TRAFFIC_KINDS.map((kind) => kind.routePrefix),
    );
    for (const kind of TRAFFIC_KINDS) {
      for (const route of routes.get(kind.routePrefix)!) {
        expect(createRoutePath(route.points, kind.turnRadius).length).toBeGreaterThan(0);
      }
    }
  });
});
