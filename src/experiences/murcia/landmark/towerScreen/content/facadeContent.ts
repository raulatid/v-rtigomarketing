import type { FacadeBlock } from '../facadeComposition';

/**
 * The shape of the tower's content — the schema a CMS document type mirrors.
 *
 * Plain, serialisable data only: no functions, no DOM types, no `three`, so a
 * query's result can be validated by `parseTowerContent` without caring that a
 * query is where it came from. Adding a field that cannot survive `JSON.parse`
 * breaks that property, which is the only rule this file has.
 *
 * A composition lists its `FacadeBlock`s directly — metres, cap heights and
 * reveal windows included — so a layout can be authored as a document rather
 * than as code. It still cannot name a colour: `parseBlocks` rejects `color`,
 * so the document opens the layout and not the palette.
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
