import type { FacadeBlock } from '../facadeComposition';

/**
 * The shared shape of bundled tower and campus content.
 *
 * Plain, serialisable data only: no functions, no DOM types, no `three`.
 * The current inputs are typed TypeScript documents. A future external source
 * must validate its data at that boundary before handing it to the renderer.
 *
 * A composition lists its `FacadeBlock`s directly — metres, cap heights and
 * reveal windows included — so a layout can be authored as a document rather
 * than as rendering code. Authored content should use semantic tones; the
 * renderer owns the palette. These types do not validate external data.
 */

export interface FreeformContent {
  /** Kept as a discriminant so a second template can join without a migration. */
  readonly template: 'freeform';
  /** Stable id: what the rotation names and a slide is keyed on. */
  readonly id: string;
  /** Never drawn. */
  readonly label: string;
  /** Painted in order, so later blocks sit on top. */
  readonly blocks: readonly FacadeBlock[];
}

export type FacadeContent = FreeformContent;

/**
 * Which compositions take turns on the screen, and for how long each is shown.
 *
 * Content, not code, for the same reason the compositions are: how long the
 * offer of the month stays up is the client's call. `seconds` counts from the
 * moment a slide has settled, so it is time spent readable, not arriving.
 */
export interface FacadeRotation {
  /** Composition ids, shown in this order and then again from the first. */
  readonly compositions: readonly [string, ...string[]];
  readonly seconds: number;
}

export interface FacadeContentDocument {
  readonly compositions: readonly FacadeContent[];
  /** Absent means the screen holds its first composition. */
  readonly rotation?: FacadeRotation;
}
