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
   * One GLB per shape under `public/models/vehicles/`: a single mesh with a
   * single material, front along glTF -Z, origin on the ground (or the
   * waterline), and a `_TONE` attribute that is 1 on the body and 0 elsewhere.
   */
  readonly models: readonly string[];
  /**
   * The body colours, linear RGB like the GLB's `COLOR_0`. A vehicle is a
   * shape and a tone, picked uniformly at each spawn; the tone replaces the
   * vertex colour where `_TONE` is 1, so every tone of a shape is one draw call.
   */
  readonly tones: readonly ToneColour[];
  /** Half-width of the heading window at a corner, in metres (`createRoutePath`). */
  readonly turnRadius: number;
  readonly schedule: TrafficScheduleConfig;
}

export type ToneColour = readonly [r: number, g: number, b: number];

/**
 * The three city tones, azul, salvia and terracota: the body colours the
 * vehicles were first exported with, one GLB per tone.
 */
const CITY_TONES: readonly ToneColour[] = [
  [0.030713, 0.099899, 0.23074],
  [0.158961, 0.278894, 0.130137],
  [0.434154, 0.109462, 0.066626],
];

function vehicleModels(shapes: readonly string[]): string[] {
  return shapes.map((shape) => `/models/vehicles/${shape}.glb`);
}

export const TRAFFIC_KINDS: readonly TrafficKind[] = [
  {
    name: 'naval',
    routePrefix: 'ruta-naval-',
    models: vehicleModels(['barca_paseo', 'barco_cubierto', 'lancha']),
    tones: CITY_TONES,
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
    models: vehicleModels(['compacto', 'sedan', 'furgoneta']),
    tones: CITY_TONES,
    // Street corners are tight: a short window, or cars would cut them.
    turnRadius: 4,
    // 10 m/s (36 km/h), city traffic. A car every 4 to 10 s per street.
    schedule: { speed: 10, interval: [4, 10], maxActive: 30 },
  },
];

/** A modest device (the lightmaps' `mobile` profile) carries this share of each kind's cap. */
export const MODEST_DEVICE_SHARE = 0.5;
