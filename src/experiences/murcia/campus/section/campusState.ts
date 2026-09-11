/**
 * Where the visitor is in the section. A small observable store, the shape of
 * `services-buildings/districtState.ts`.
 *
 *   overview   the campus from above; orbit is live, the lake is clickable
 *   intro      close to the lake, the disc formed, the intro copy shown
 *   service i  its symbol and its figure in turn, its whole copy shown
 *
 * The section is a RING. `position` counts steps taken and is never wrapped:
 * going forward from the last service reaches the intro again one step
 * further round, and the camera keeps walking the same way. `stage` and
 * `index` are its remainder, for whoever needs to know what is up rather
 * than how far round we are.
 */

export type CampusStage = 'overview' | 'intro' | 'service';

export interface CampusSnapshot {
  readonly stage: CampusStage;
  /** Meaningful only when `stage` is `'service'`. */
  readonly index: number;
  /** Steps taken round the ring since entering. Unbounded, either sign. */
  readonly position: number;
}

export interface CampusState {
  readonly snapshot: CampusSnapshot;
  enter(): void;
  next(): void;
  previous(): void;
  exit(): void;
  subscribe(listener: (snapshot: CampusSnapshot, previous: CampusSnapshot) => void): () => void;
}

const OVERVIEW: CampusSnapshot = { stage: 'overview', index: 0, position: 0 };

export function createCampusState(serviceCount: number): CampusState {
  /** Stops round the ring: the intro plus one per service. */
  const stops = serviceCount + 1;

  let snapshot: CampusSnapshot = OVERVIEW;
  const listeners = new Set<(snapshot: CampusSnapshot, previous: CampusSnapshot) => void>();

  const at = (position: number): CampusSnapshot => {
    const slot = ((position % stops) + stops) % stops;
    return slot === 0
      ? { stage: 'intro', index: 0, position }
      : { stage: 'service', index: slot - 1, position };
  };

  const set = (next: CampusSnapshot): void => {
    if (next.stage === snapshot.stage && next.position === snapshot.position) return;
    const previous = snapshot;
    snapshot = next;
    for (const listener of [...listeners]) listener(snapshot, previous);
  };

  return {
    get snapshot() {
      return snapshot;
    },
    enter() {
      if (snapshot.stage === 'overview') set(at(0));
    },
    next() {
      if (snapshot.stage !== 'overview') set(at(snapshot.position + 1));
    },
    previous() {
      if (snapshot.stage !== 'overview') set(at(snapshot.position - 1));
    },
    exit() {
      set(OVERVIEW);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
