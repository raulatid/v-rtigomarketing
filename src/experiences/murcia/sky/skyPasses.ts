/**
 * The satellites over Murcia: where each one is in the sky, and how visible.
 *
 * Pure and stateless — a pass is a function of time, so any frame rate lands
 * every satellite in the same place at the same second, and a test can ask
 * about any second without stepping to it. No `three` here: directions are
 * plain unit vectors in the world's frame, +Y up.
 *
 * ## A pass is a great circle
 *
 * Each satellite runs a great circle of the sky at a constant angular speed.
 * Seen from the centre, a great circle is a plane through the eye, so on
 * screen every pass is a straight line — the look of a real satellite crossing
 * the night, and what the Conócenos sky stop was designed around (plan 027).
 *
 * The circle is set by its highest point: `elevation` above the horizon at
 * `azimuth`. Its other axis is horizontal, so the height of the satellite at
 * a phase depends on `elevation` alone — which is what lets the plane turn
 * about the vertical without the satellite jumping in or out of view.
 *
 * ## Seen only where the sky is dark
 *
 * `alpha` rises with the direction's height over the band where the dome turns
 * to night (`environment/createSkyDome.ts`), so a satellite fades in coming up
 * out of the blue and fades out going back into it.
 *
 * ## A new line each lap
 *
 * Once a lap, at the circle's lowest point — always below the horizon, so
 * never seen — the plane turns to a new azimuth. A satellite never crosses the
 * same line twice running, and each new line is drawn around `focus`, the
 * patch of sky the sky stop frames, so most passes cross that frame.
 */

export type Direction = readonly [number, number, number];

export interface SkyPass {
  /** Unit vector toward the satellite at `t` seconds. */
  direction(t: number): Direction;
  /** 0..1: how much of it shows at `t`. Zero below the dark part of the sky. */
  alpha(t: number): number;
}

export interface SkyPassOptions {
  readonly count: number;
  /**
   * Unit vector: the patch of dark sky the sky stop frames best. The passes'
   * tops are drawn around it. A desktop and a phone frame different patches,
   * so the host hands the one its layout sees.
   */
  readonly focus: Direction;
  /** Same seed, same sky. */
  readonly seed: number;
}

/**
 * Where a satellite shows, in the direction's height (`y`, the sine of its
 * elevation): from where the dome's day blue is mostly gone to where it is
 * night (`NIGHT_FULL` 0.42 in `createSkyDome.ts`). Below, a point of light
 * would read as a speck on blue, not a satellite.
 */
export const VISIBLE_FROM = 0.28;
export const VISIBLE_FULL = 0.42;

/**
 * Degrees a pass's top may land below and above the focus. Mostly below: a
 * top much above it runs along the frame's upper edge or just over it (seen on
 * 2026-10-22 at 1440×900, with 12 above). Never lower than
 * `MIN_ELEVATION_DEGREES`, where a pass would spend its crossing in the blue.
 */
const ELEVATION_SPREAD_DEGREES = { below: 8, above: 5 } as const;
const MIN_ELEVATION_DEGREES = 24;
/**
 * Degrees either side of the focus's azimuth a pass's top may land. The lines
 * then cross the frame at a slant rather than all level; narrower, and on a
 * phone the high ones pass over the frame instead of through it (measured in
 * `skyPasses.test.ts`).
 */
const AZIMUTH_SPREAD_DEGREES = 35;
/**
 * Seconds per lap, the same for every satellite: 3° a second. The phone's sky
 * stop is about 17° wide, so a satellite stays in it long enough to carry a
 * brand panel (`panelSchedule.ts`); at 36 s it crossed in under two, and the
 * desktop's free sky left of the plate in about as little (simulated on
 * 2026-10-22). Slow also reads as far away. Most of a lap is spent below the
 * dark, which is why there are several.
 */
const LAP_SECONDS = 120;
/**
 * The satellites travel in twos, spread round the lap pair by pair, so the
 * brand panels can come up two at a time (`panelSchedule.ts`). A pair shares
 * its lap and the azimuth of each new line, and crosses it in OPPOSITE senses
 * at two heights `PAIR_SEPARATION_DEGREES` apart: two crossings that meet
 * over the frame, not a formation. Satellites going their own way were almost
 * never in the frame together (simulated on 2026-10-22).
 *
 * `PAIR_LAG` is the share of a lap between the two, so they do not mirror
 * each other exactly.
 */
const PAIR_LAG = 0.01;
const PAIR_SEPARATION_DEGREES = 5;
/** Share of a lap a satellite's start may wander, so the pairs are not metronomic. */
const START_JITTER = 0.04;

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

/** Mulberry32, as the stars use: the same sky every visit. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number in 0..1 for a satellite's lap: the same lap draws the same line however it is reached. */
function lapDraw(seed: number, lap: number): number {
  return seeded((Math.imul(seed, 0x9e3779b1) ^ Math.imul(lap, 0x85ebca6b)) >>> 0)();
}

const smoothstep = (from: number, to: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

export function createSkyPasses(options: SkyPassOptions): SkyPass[] {
  const random = seeded(options.seed);
  const [fx, fy, fz] = options.focus;
  const focusAzimuth = Math.atan2(fz, fx);
  const focusElevation = Math.asin(Math.min(1, Math.max(-1, fy))) / DEG;
  const lowest = Math.max(MIN_ELEVATION_DEGREES, focusElevation - ELEVATION_SPREAD_DEGREES.below);
  const highest = Math.max(lowest, focusElevation + ELEVATION_SPREAD_DEGREES.above);
  const speed = TWO_PI / LAP_SECONDS;
  const pairCount = Math.ceil(options.count / 2);
  const pairs = Array.from({ length: pairCount }, (_, pair) => {
    const separation = Math.min(PAIR_SEPARATION_DEGREES, highest - lowest);
    const low = lowest + (highest - lowest - separation) * random();
    const highFirst = random() < 0.5;
    return {
      start: TWO_PI * (pair / pairCount + START_JITTER * random()),
      lapSeed: Math.floor(random() * 0xffffffff),
      sense: random() < 0.5 ? -1 : 1,
      elevations: highFirst ? [low + separation, low] : [low, low + separation],
    };
  });
  return Array.from({ length: options.count }, (_, index) => {
    const pair = pairs[Math.floor(index / 2)]!;
    const member = index % 2;
    const elevation = pair.elevations[member]! * DEG;
    const sense = member === 0 ? pair.sense : -pair.sense;
    const start = pair.start + TWO_PI * member * PAIR_LAG;
    const lapSeed = pair.lapSeed;
    const sinE = Math.sin(elevation);
    const cosE = Math.cos(elevation);

    const direction = (t: number): Direction => {
      // `travelled` only grows; the lap turns over where the phase passes the
      // circle's lowest point (π), which is below the horizon.
      const travelled = start + speed * t;
      const lap = Math.floor((travelled + Math.PI) / TWO_PI);
      const theta = sense * travelled;
      const azimuth = focusAzimuth + (2 * lapDraw(lapSeed, lap) - 1) * AZIMUTH_SPREAD_DEGREES * DEG;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const cosA = Math.cos(azimuth);
      const sinA = Math.sin(azimuth);
      // cos θ · top + sin θ · side, with side horizontal.
      return [cosT * cosE * cosA - sinT * sinA, cosT * sinE, cosT * cosE * sinA + sinT * cosA];
    };

    return {
      direction,
      alpha: (t) => smoothstep(VISIBLE_FROM, VISIBLE_FULL, direction(t)[1]),
    };
  });
}
