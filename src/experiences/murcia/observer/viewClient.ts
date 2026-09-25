import type { ObserverConfig } from './observerConfig';
import type { ObserverSample } from './observerProjection';

/** Mirrors `TOKEN_LENGTH` in `server/view/token.ts`; the browser cannot import the server tier. */
const TOKEN_LENGTH = 44;

export const VIEW_ENDPOINT = '/api/view';
export const CLAIM_ENDPOINT = '/api/claim';

export interface ViewReply {
  t: string;
  /** Present once the token is of the FINAL stage: the claim may be offered. */
  f?: 1;
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
 * What a claim came to. `closed` means somebody else already won — there is
 * nothing left to retry — as opposed to a refusal that might not recur.
 */
export type ClaimOutcome = { code: string } | { code: null; closed: boolean };

/** What the city hands outward when the final vantage point is held. */
export type ViewpointClaim = (email: string) => Promise<ClaimOutcome>;

/**
 * Spends a final-stage token on a claim.
 *
 * `consent: true` is sent because the only caller that reaches this in
 * production is the claim dialog's submit, which is disabled until the
 * claimant ticks the privacy box; the server refuses a claim without it.
 * Throws on a network failure or a non-2xx answer, which the caller shows as
 * "try again".
 */
export async function claimWithToken(
  token: string,
  email: string,
  fetchImpl: typeof fetch = defaultFetch,
): Promise<ClaimOutcome> {
  const body = (await post(fetchImpl, CLAIM_ENDPOINT, { t: token, email, consent: true })) as {
    code?: unknown;
    closed?: unknown;
  } | null;
  if (typeof body?.code === 'string') return { code: body.code };
  return { code: null, closed: body?.closed === true };
}
