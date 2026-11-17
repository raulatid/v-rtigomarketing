import type { TrafficScheduleConfig } from './trafficSchedule';

/**
 * The kinds of ambient traffic: which routes they take, which models they
 * draw, and how they move. The numbers are a first take, to be judged by eye
 * and measured; the decision is `docs/decisiones/murcia/trafico.md`.
 */
export interface TrafficKind {
  readonly name: string;
  /** Routes in `trafficRoutes.json` whose name starts with this carry the kind. */
  readonly routePrefix: string;
  /**
   * One GLB per model under `public/models/vehicles/`: a single mesh with a
   * single material, front along glTF -Z, origin on the ground (or the
   * waterline). Picked uniformly at each spawn.
   */
  readonly models: readonly string[];
  /** Half-width of the heading window at a corner, in metres (`createRoutePath`). */
  readonly turnRadius: number;
  readonly schedule: TrafficScheduleConfig;
}

export const TRAFFIC_KINDS: readonly TrafficKind[] = [
  {
    name: 'naval',
    routePrefix: 'ruta-naval-',
    models: ['/models/vehicles/barca_paseo_azul.glb'],
    // A river bend is wide; a boat swings through it slowly.
    turnRadius: 12,
    // 5 m/s reads as a pleasure boat from the camera's height. A boat every
    // 20 to 40 s per bank keeps the river alive without a procession. A route
    // takes ~3 min, so each route carries about six at once: a cap of 3 for
    // both routes left the plate's stretch of river mostly empty.
    schedule: { speed: 5, interval: [20, 40], maxActive: 12 },
  },
  {
    name: 'vial',
    routePrefix: 'ruta-vial-',
    // Empty until the car GLBs are in `public/models/vehicles/`: a kind with
    // no models draws nothing.
    models: [],
    // Street corners are tight: a short window, or cars would cut them.
    turnRadius: 4,
    // 10 m/s (36 km/h), city traffic. A car every 4 to 10 s per street.
    schedule: { speed: 10, interval: [4, 10], maxActive: 30 },
  },
];

/** A modest device (the lightmaps' `mobile` profile) carries this share of each kind's cap. */
export const MODEST_DEVICE_SHARE = 0.5;
