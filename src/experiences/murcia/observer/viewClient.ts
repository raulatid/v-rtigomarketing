import type { ObserverConfig } from './observerConfig';
import type { ObserverSample } from './observerProjection';

/** Mirrors `TOKEN_LENGTH` in `server/view/token.ts`; the browser cannot import the server tier. */
const TOKEN_LENGTH = 44;

export const VIEW_ENDPOINT = '/api/view';
export const CLAIM_ENDPOINT = '/api/claim';

export interface ViewReply {
  t: string;
  /** Present only when the server was started with `VIEW_DEBUG=1`, outside production. */
  dbg?: Record<string, unknown>;
}

export interface ViewClientOptions {
  config: ObserverConfig;
  fetchImpl?: typeof fetch;
  /** Milliseconds. */
  now?: () => number;
  /** Every parsed reply. The authoring overlay's window onto the verdict. */
  onReply?: (reply: ViewReply) => void;
  /** Network and parse failures. See `report` for why nothing else happens. */
  onError?: (error: unknown) => void;
}

export interface ViewClient {
  /** Reports a rest, if the throttle allows. Fire and forget. */
  report(sample: Readonly<ObserverSample>): void;
  /** The progress carried so far, opaque. Null before the first reply. */
  readonly token: string | null;
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

const defaultFetch: typeof fetch = (input, init) => fetch(input, init);

async function post(fetchImpl: typeof fetch, url: string, body: unknown): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(url + ' answered ' + response.status);
  return response.json();
}

/**
 * The city's side of `/api/view`: send where the camera rested, keep whatever
 * token comes back.
 *
 * The token is kept IN MEMORY only. Persisting it would be storage the site
 * asks consent for, and progress through the vantage points is a single
 * visit's worth of navigating.
 *
 * Failures change nothing a visitor can see, on purpose: a lost report is a rest
 * that was not counted, and the next rest is reported anyway. They reach
 * `onError`, which the debug build logs.
 */
export function createViewClient(options: ViewClientOptions): ViewClient {
  const { config } = options;
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const now = options.now ?? (() => performance.now());

  let token: string | null = null;
  let reports = 0;
  let lastReportAt = -Infinity;
  let inFlight = false;

  return {
    report(sample) {
      const at = now();
      if (inFlight || reports >= config.maxReportsPerSession) return;
      if (at - lastReportAt < config.minReportIntervalSeconds * 1000) return;
      reports += 1;
      lastReportAt = at;
      inFlight = true;

      const { position: p, forward: f } = sample;
      void post(fetchImpl, VIEW_ENDPOINT, {
        p: [round(p.x, 3), round(p.y, 3), round(p.z, 3)],
        f: [round(f.x, 5), round(f.y, 5), round(f.z, 5)],
        fov: round(sample.fov, 3),
        ...(token !== null && { t: token }),
      })
        .then((body) => {
          const reply = body as Partial<ViewReply> | null;
          if (typeof reply?.t !== 'string' || reply.t.length !== TOKEN_LENGTH) {
            throw new Error('unexpected reply shape');
          }
          token = reply.t;
          options.onReply?.(reply as ViewReply);
        })
        .catch((error: unknown) => options.onError?.(error))
        .finally(() => {
          inFlight = false;
        });
    },
    get token() {
      return token;
    },
  };
}

/**
 * Spends a final-stage token on a claim: the code, or null.
 *
 * A free function rather than a method of the client, so that nothing in a
 * production bundle names the endpoint until something there calls it. Today
 * only the authoring seam does; the eventual in-city claim will be the first.
 */
export async function claimWithToken(
  token: string,
  email: string,
  fetchImpl: typeof fetch = defaultFetch,
): Promise<string | null> {
  const body = (await post(fetchImpl, CLAIM_ENDPOINT, { t: token, email })) as { code?: unknown } | null;
  return typeof body?.code === 'string' ? body.code : null;
}
