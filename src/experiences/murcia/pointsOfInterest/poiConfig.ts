/**
 * The city's points of interest: what can be clicked, said from anywhere.
 *
 * Viewers kept reporting that they could not tell which buildings answered a
 * click. A hover tint only speaks to a pointer already there, and the idle
 * blink and the geotags that tried to say it from afar (2026-09-22 to
 * 2026-10-20) read as decoration. A dot in the brand's blue on each place,
 * always on top, says "this one" without asking the viewer to find it first.
 *
 * Order is the order the labels arrive in.
 */
export type PoiId = 'blog' | 'servicios' | 'conocenos';

export interface PoiDefinition {
  readonly id: PoiId;
  readonly label: string;
  /** False for a place that names itself but has nowhere to take the viewer yet. */
  readonly clickable: boolean;
}

export const POI_DEFINITIONS: readonly PoiDefinition[] = [
  { id: 'blog', label: 'Blog', clickable: true },
  { id: 'servicios', label: 'Servicios', clickable: true },
  // Clickable by kind; whether it goes anywhere is decided at run time, since
  // the Conócenos document is optional (`PoiInteractionDeps.clickable`).
  { id: 'conocenos', label: 'Conócenos', clickable: true },
];

export const POI = {
  /** How long the labels stay up after each arrival in the city, in seconds. */
  announceSeconds: 5,
  /** Client px from a dot's centre that still counts as on it, per pointer type. */
  hitRadiusPx: { mouse: 18, touch: 26 },
};
