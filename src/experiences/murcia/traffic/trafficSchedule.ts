/**
 * Who is on which route, and how far along: the ambient traffic's whole
 * behaviour, for one kind of vehicle. Pure: no three, no allocation per frame
 * once the agent list has grown to its cap.
 *
 * Every route is one-way. A vehicle appears at the start of a route, runs it at
 * the kind's constant speed and is gone at its end; nothing comes back. The
 * ends of every route are authored beyond the fog, so appearing and going are
 * instant. One constant speed per kind and a gap between spawns on each route
 * mean two vehicles on the same route never close on each other.
 *
 * Each route has its own timer: the next spawn is a random interval away. When
 * the kind is at its cap the spawn is skipped and the timer starts again.
 */

export interface TrafficScheduleConfig {
  /** Metres per second, the same for every vehicle of the kind. */
  speed: number;
  /** Seconds between two spawns on one route, drawn uniformly in [min, max]. */
  interval: readonly [min: number, max: number];
  /** Most vehicles of the kind on all its routes at once. */
  maxActive: number;
}

export interface TrafficAgent {
  route: number;
  model: number;
  /** Metres from the route's start. */
  distance: number;
}

export interface TrafficSchedule {
  /** Live vehicles, in no particular order. Read it; do not keep references across steps. */
  readonly agents: readonly TrafficAgent[];
  step(delta: number): void;
}

/** Simulated step while warming up, in seconds: coarse is fine, the spawn carries its overshoot. */
const WARMUP_STEP = 0.5;

export function createTrafficSchedule(options: {
  /** Length of each route, in metres. */
  routeLengths: readonly number[];
  modelCount: number;
  config: TrafficScheduleConfig;
  /** Uniform in [0, 1). `Math.random` in production, seeded in tests. */
  random: () => number;
  /**
   * Run the traffic for as long as the longest route takes before handing it
   * over, so the first frame already shows vehicles along their routes.
   */
  warmUp: boolean;
}): TrafficSchedule {
  const { routeLengths, modelCount, config, random } = options;
  const [minInterval, maxInterval] = config.interval;
  if (!(config.speed > 0)) throw new Error('[traffic] speed must be positive');
  if (!(minInterval > 0) || !(maxInterval >= minInterval)) {
    throw new Error('[traffic] interval must be [min, max] with 0 < min <= max');
  }
  if (!(modelCount > 0)) throw new Error('[traffic] a kind needs at least one model');

  const agents: TrafficAgent[] = [];
  const nextInterval = (): number => minInterval + (maxInterval - minInterval) * random();
  // Staggered from the start, so the routes do not all spawn on the same frame.
  const nextSpawn = routeLengths.map(() => maxInterval * random());

  const step = (delta: number): void => {
    if (!(delta > 0)) return;
    const travelled = config.speed * delta;
    for (let i = agents.length - 1; i >= 0; i--) {
      const agent = agents[i]!;
      agent.distance += travelled;
      if (agent.distance >= routeLengths[agent.route]!) {
        // Order does not matter: swap with the last and drop it.
        agents[i] = agents[agents.length - 1]!;
        agents.pop();
      }
    }
    for (let route = 0; route < nextSpawn.length; route++) {
      nextSpawn[route]! -= delta;
      while (nextSpawn[route]! <= 0) {
        // How long ago, inside this step, the spawn was due: it has run that far already.
        const late = -nextSpawn[route]!;
        nextSpawn[route]! += nextInterval();
        if (agents.length >= config.maxActive) continue;
        const distance = late * config.speed;
        if (distance >= routeLengths[route]!) continue;
        agents.push({ route, model: Math.min(modelCount - 1, Math.floor(random() * modelCount)), distance });
      }
    }
  };

  if (options.warmUp) {
    const longest = Math.max(0, ...routeLengths);
    for (let t = 0; t < longest / config.speed; t += WARMUP_STEP) step(WARMUP_STEP);
  }

  return { agents, step };
}
