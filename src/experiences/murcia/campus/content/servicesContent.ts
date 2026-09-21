/**
 * What the campus says: the schema, and the parser a host runs over
 * whatever its source returns.
 *
 * Nothing here loads anything. The lab reads a JSON out of `public/`; the
 * site generates its content from Sanity at build time and passes the
 * result in. Both go through `parseServicesContent`, which is written
 * against `unknown` and is total: a whole document or `null`, never half
 * of one. Rejection is per document, not per service: a content set is
 * written by one person in one sitting, and silently dropping one entry is
 * how a mistake ships.
 *
 * ## The contract, for a Sanity mapping
 *
 *   intro      { title, subtitle, hint, color }                       a singleton
 *   services[] { id, title, subtitle, icon, figure, detail, color,
 *                caption, measures }                                  in display order
 *
 * `icon` names an entry of the host's icon library (`iconLibrary.ts`);
 * `figure` is one of `FIGURE_KINDS`. `detail` is the rest of the copy, under
 * the subtitle. `color` is `#rrggbb`, mixed with white in the particles.
 * `caption` names what the figure draws, or is null; `measures` may be empty.
 *
 * `figure` may be NULL, and that is a supported document rather than a broken
 * one: the Studio field is optional and has no default, so a service whose copy
 * has been rewritten but whose figure nobody has re-chosen keeps its symbol and
 * turns into nothing. Rejecting the set for it — which is what happened while
 * the figure came from a table keyed by slug — took the whole campus down to
 * scenery over one service.
 */

import {
  CAMPUS_FIGURES,
  isCampusFigure,
  type CampusFigure,
} from '../../../../content/campusShapes';

/**
 * Each figure draws the one mechanism its service's copy states — see
 * `figureLayouts.ts` — so a figure belongs to a service, not to a style.
 *
 * Re-exported rather than declared. The list moved to `src/content/campusShapes.ts`
 * when the choice became a Studio field: the Sanity schema has to offer these
 * options and the content build has to refuse anything else, and neither of
 * those may import an experience (`checks/architecture.ts` §1b). The name stays
 * because the campus is full of it.
 */
export const FIGURE_KINDS = CAMPUS_FIGURES;
export type FigureKind = CampusFigure;

export interface IntroContent {
  readonly title: string;
  readonly subtitle: string;
  readonly hint: string;
  /** Mixed with white in the disc, `#rrggbb`. */
  readonly color: string;
}

export interface ServiceContent {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  /** A key of the icon library. Checked when the campus is attached. */
  readonly icon: string;
  /** What the symbol turns into and back from. Null: it stays a symbol. */
  readonly figure: FigureKind | null;
  /** The rest of the copy, under the subtitle. */
  readonly detail: string;
  /** Mixed with white in the symbol and the figure, `#rrggbb`. */
  readonly color: string;
  /** What the figure draws, in one line: its legend. Null when there is none. */
  readonly caption: string | null;
  /** The names of what gets measured. Empty when there are none. */
  readonly measures: readonly string[];
}

export interface ServicesContent {
  readonly intro: IntroContent;
  readonly services: readonly ServiceContent[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFilledString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFigureKind = isCampusFigure;

const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

function parseIntro(value: unknown): IntroContent | null {
  if (!isRecord(value)) return null;
  const title = value['title'];
  const subtitle = value['subtitle'];
  const hint = value['hint'];
  const color = value['color'];
  if (!isFilledString(title) || !isFilledString(subtitle) || !isFilledString(hint)) return null;
  if (!isHexColor(color)) return null;
  return { title, subtitle, hint, color };
}

function parseService(value: unknown): ServiceContent | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
  const title = value['title'];
  const subtitle = value['subtitle'];
  const icon = value['icon'];
  const figure = value['figure'];
  const detail = value['detail'];
  const color = value['color'];
  const caption = value['caption'];
  const measures = value['measures'];
  if (!isFilledString(id) || !isFilledString(title) || !isFilledString(subtitle)) return null;
  // `figure` is the one field a valid document may omit: null is "keeps its
  // symbol", and only a string that is not a figure kind is a mistake.
  if (!isFilledString(icon) || !isFilledString(detail)) return null;
  if (figure !== null && !isFigureKind(figure)) return null;
  if (!isHexColor(color)) return null;
  if (caption !== null && !isFilledString(caption)) return null;
  if (!Array.isArray(measures) || !measures.every(isFilledString)) return null;
  return { id, title, subtitle, icon, figure, detail, color, caption, measures: measures as string[] };
}

/** A whole document or nothing: a duplicate id or one bad service rejects the file. */
export function parseServicesContent(raw: unknown): ServicesContent | null {
  if (!isRecord(raw)) return null;

  const intro = parseIntro(raw['intro']);
  if (!intro) return null;

  const list = raw['services'];
  if (!Array.isArray(list) || list.length === 0) return null;

  const services: ServiceContent[] = [];
  const ids = new Set<string>();
  for (const entry of list as readonly unknown[]) {
    const service = parseService(entry);
    if (!service || ids.has(service.id)) return null;
    ids.add(service.id);
    services.push(service);
  }

  return { intro, services };
}
