import { describe, expect, it } from 'vitest';
import { createTrafficSchedule, type TrafficScheduleConfig } from './trafficSchedule';

/** A small deterministic generator (mulberry32), so every run sees the same traffic. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const config: TrafficScheduleConfig = { speed: 10, interval: [2, 4], maxActive: 5 };

describe('createTrafficSchedule', () => {
  it('starts empty without a warm-up', () => {
    const schedule = createTrafficSchedule({
      routeLengths: [100],
      modelCount: 1,
      config,
      random: seeded(1),
      warmUp: false,
    });
    expect(schedule.agents).toHaveLength(0);
  });

  it('spawns at the start of a route, runs it at constant speed and drops it at the end', () => {
    // random() = 0: first spawn due at once, every interval is the minimum.
    const schedule = createTrafficSchedule({
      routeLengths: [100],
      modelCount: 1,
      config: { ...config, interval: [50, 50] },
      random: () => 0,
      warmUp: false,
    });
    schedule.step(0.1);
    expect(schedule.agents).toHaveLength(1);
    expect(schedule.agents[0]!.distance).toBeCloseTo(1);
    schedule.step(1);
    expect(schedule.agents[0]!.distance).toBeCloseTo(11);
    for (let i = 0; i < 9; i++) schedule.step(1);
    expect(schedule.agents).toHaveLength(0);
  });

  it('keeps every interval between spawns on one route inside its range', () => {
    const schedule = createTrafficSchedule({
      routeLengths: [10_000],
      modelCount: 1,
      config: { ...config, maxActive: 1000 },
      random: seeded(7),
      warmUp: false,
    });
    for (let i = 0; i < 2000; i++) schedule.step(0.05);
    const distances = schedule.agents.map((agent) => agent.distance).sort((a, b) => a - b);
    expect(distances.length).toBeGreaterThan(10);
    for (let i = 1; i < distances.length; i++) {
      const gap = (distances[i]! - distances[i - 1]!) / config.speed;
      expect(gap).toBeGreaterThanOrEqual(config.interval[0] - 1e-6);
      expect(gap).toBeLessThanOrEqual(config.interval[1] + 1e-6);
    }
  });

  it('never exceeds the cap and skips the spawns it cannot place', () => {
    const schedule = createTrafficSchedule({
      routeLengths: [1000, 1000, 1000],
      modelCount: 3,
      config: { ...config, maxActive: 4 },
      random: seeded(3),
      warmUp: false,
    });
    let peak = 0;
    for (let i = 0; i < 1000; i++) {
      schedule.step(0.1);
      peak = Math.max(peak, schedule.agents.length);
    }
    expect(peak).toBe(4);
  });

  it('warms up into vehicles spread along their routes, each on a valid route and model', () => {
    const lengths = [300, 500];
    const schedule = createTrafficSchedule({
      routeLengths: lengths,
      modelCount: 3,
      config,
      random: seeded(11),
      warmUp: true,
    });
    expect(schedule.agents.length).toBeGreaterThan(0);
    expect(schedule.agents.length).toBeLessThanOrEqual(config.maxActive);
    for (const agent of schedule.agents) {
      expect(agent.distance).toBeGreaterThanOrEqual(0);
      expect(agent.distance).toBeLessThan(lengths[agent.route]!);
      expect([0, 1, 2]).toContain(agent.model);
    }
  });

  it('picks every model over time', () => {
    const schedule = createTrafficSchedule({
      routeLengths: [100],
      modelCount: 3,
      config: { ...config, maxActive: 100 },
      random: seeded(5),
      warmUp: false,
    });
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      schedule.step(0.1);
      for (const agent of schedule.agents) seen.add(agent.model);
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it('rejects a configuration it cannot run', () => {
    const base = { routeLengths: [100], modelCount: 1, random: () => 0, warmUp: false };
    expect(() => createTrafficSchedule({ ...base, config: { ...config, speed: 0 } })).toThrow();
    expect(() => createTrafficSchedule({ ...base, config: { ...config, interval: [0, 1] } })).toThrow();
    expect(() => createTrafficSchedule({ ...base, config: { ...config, interval: [3, 2] } })).toThrow();
    expect(() => createTrafficSchedule({ ...base, modelCount: 0, config })).toThrow();
  });
});
