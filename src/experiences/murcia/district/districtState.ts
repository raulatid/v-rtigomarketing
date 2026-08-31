/**
 * The district's whole state: is it open, which service is active, and whether
 * the visitor is reading the long copy.
 *
 * `activeServiceIndex` is the single source of truth. Everything downstream —
 * the display's copy and counter, which building is lit, where the signal
 * starts — is DERIVED from it. There is deliberately no separate "selected
 * building", because two fields describing one fact are two fields that can
 * disagree (plan 003 §1).
 *
 * It knows nothing about meshes, pointers, shaders or copy. The display reads
 * it, the buildings read it, the interaction writes to it through named
 * transitions. That separation is what lets the whole navigation model change —
 * as it just did — without any of them being rewritten.
 */

export interface DistrictSnapshot {
  readonly districtActive: boolean;
  /** Index into the service list. Meaningless while the district is closed. */
  readonly activeServiceIndex: number;
  readonly detailOpen: boolean;
}

export type DistrictListener = (state: DistrictSnapshot) => void;

export interface DistrictState {
  get(): DistrictSnapshot;
  /** Opens the district on the first service. Never an empty state. */
  enterDistrict(): void;
  /** Both wrap, and neither is ever disabled at an end (plan 003 §2). */
  nextService(): void;
  previousService(): void;
  openDetail(): void;
  closeDetail(): void;
  exitDistrict(): void;
  subscribe(listener: DistrictListener): () => void;
}

export interface DistrictStateOptions {
  /** How many services there are. Navigation wraps within this count. */
  serviceCount: number;
}

export function createDistrictState(options: DistrictStateOptions): DistrictState {
  const count = Math.max(1, options.serviceCount);

  let districtActive = false;
  let activeServiceIndex = 0;
  let detailOpen = false;

  const listeners = new Set<DistrictListener>();

  const snapshot = (): DistrictSnapshot => ({ districtActive, activeServiceIndex, detailOpen });

  // Copied before iterating: a listener that unsubscribes itself while being
  // notified would otherwise mutate the set mid-iteration.
  const emit = (): void => {
    const state = snapshot();
    for (const listener of [...listeners]) listener(state);
  };

  /**
   * Every service change closes the detail. Reading is a deliberate act and is
   * not inherited by the next service — and it stops the visitor landing
   * part-way down copy they never asked to open (plan 003 §22).
   */
  const goTo = (index: number): void => {
    if (!districtActive) return;
    const next = ((index % count) + count) % count;
    if (next === activeServiceIndex && !detailOpen) return;
    activeServiceIndex = next;
    detailOpen = false;
    emit();
  };

  return {
    get: snapshot,

    enterDistrict() {
      if (districtActive) return;
      districtActive = true;
      // The first service is active immediately. There is no "select a
      // building" state any more, because buildings no longer select anything.
      activeServiceIndex = 0;
      detailOpen = false;
      emit();
    },

    nextService() {
      goTo(activeServiceIndex + 1);
    },

    previousService() {
      goTo(activeServiceIndex - 1);
    },

    openDetail() {
      if (!districtActive || detailOpen) return;
      detailOpen = true;
      emit();
    },

    closeDetail() {
      if (!districtActive || !detailOpen) return;
      detailOpen = false;
      emit();
    },

    exitDistrict() {
      if (!districtActive) return;
      districtActive = false;
      detailOpen = false;
      // The index is left where it was rather than reset: `enterDistrict` sets
      // it, so re-entry is deterministic regardless, and clearing it here would
      // make the exit animation jump to another service as it leaves.
      emit();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
