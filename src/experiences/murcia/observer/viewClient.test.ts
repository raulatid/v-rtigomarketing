import { describe, expect, it } from 'vitest';
import type { ObserverConfig } from './observerConfig';
import { createObserverSample } from './observerProjection';
import { createViewClient, VIEW_ENDPOINT } from './viewClient';

const CONFIG: ObserverConfig = {
  dwellSeconds: 1.8,
  stillLinearSpeed: 1,
  stillAngularSpeedDegrees: 1,
  minReportIntervalSeconds: 4,
  maxReportsPerSession: 3,
};

const token = (c: string) => c.repeat(44);

/** A fake server that answers every report with the next token in `replies`. */
function harness(replies: string[]) {
  const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
  let clock = 0;
  const errors: unknown[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const t = replies.shift() ?? 'short';
    return new Response(JSON.stringify({ t }), { status: 200 });
  }) as typeof fetch;
  const client = createViewClient({
    config: CONFIG,
    fetchImpl,
    now: () => clock,
    onError: (e) => errors.push(e),
  });
  const sample = createObserverSample();
  sample.position.set(1.23456, 2, 3);
  sample.forward.set(0, 0, -1);
  sample.fov = 35;
  return {
    client,
    sent,
    errors,
    advance: (ms: number) => (clock += ms),
    report: async () => {
      client.report(sample);
      // Let the fetch chain settle.
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe('createViewClient', () => {
  it('reports the rest, rounded, and keeps the token it is given', async () => {
    const h = harness([token('a')]);
    await h.report();
    expect(h.sent[0].url).toBe(VIEW_ENDPOINT);
    expect(h.sent[0].body).toEqual({ p: [1.235, 2, 3], f: [0, 0, -1], fov: 35 });
    expect(h.client.token).toBe(token('a'));
  });

  it('sends the held token back with the next report', async () => {
    const h = harness([token('a'), token('b')]);
    await h.report();
    h.advance(5000);
    await h.report();
    expect(h.sent[1].body.t).toBe(token('a'));
    expect(h.client.token).toBe(token('b'));
  });

  it('drops reports inside the minimum interval', async () => {
    const h = harness([token('a'), token('b')]);
    await h.report();
    h.advance(1000);
    await h.report();
    expect(h.sent).toHaveLength(1);
  });

  it('stops at the per-session cap', async () => {
    const h = harness([token('a'), token('b'), token('c'), token('d')]);
    for (let i = 0; i < 5; i++) {
      await h.report();
      h.advance(5000);
    }
    expect(h.sent).toHaveLength(3);
  });

  it('keeps the previous token and reports the error when the reply is malformed', async () => {
    const h = harness([token('a'), 'short']);
    await h.report();
    h.advance(5000);
    await h.report();
    expect(h.client.token).toBe(token('a'));
    expect(h.errors).toHaveLength(1);
  });
});
