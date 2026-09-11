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
 *   intro      { title, subtitle, hint }                       a singleton
 *   services[] { id, title, subtitle, icon, figure, detail }   in display order
 *
 * `icon` names an entry of the host's icon library (`iconLibrary.ts`);
 * `figure` is one of `FIGURE_KINDS`. `detail` is the read-more paragraph.
 */

export const FIGURE_KINDS = ['bars', 'ring', 'pins', 'line'] as const;
export type FigureKind = (typeof FIGURE_KINDS)[number];

export interface IntroContent {
  readonly title: string;
  readonly subtitle: string;
  readonly hint: string;
}

export interface ServiceContent {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  /** A key of the icon library. Checked when the campus is attached. */
  readonly icon: string;
  /** What the symbol becomes when the detail opens. */
  readonly figure: FigureKind;
  /** The read-more paragraph. */
  readonly detail: string;
}

export interface ServicesContent {
  readonly intro: IntroContent;
  readonly services: readonly ServiceContent[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFilledString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFigureKind = (value: unknown): value is FigureKind =>
  typeof value === 'string' && (FIGURE_KINDS as readonly string[]).includes(value);

function parseIntro(value: unknown): IntroContent | null {
  if (!isRecord(value)) return null;
  const title = value['title'];
  const subtitle = value['subtitle'];
  const hint = value['hint'];
  if (!isFilledString(title) || !isFilledString(subtitle) || !isFilledString(hint)) return null;
  return { title, subtitle, hint };
}

function parseService(value: unknown): ServiceContent | null {
  if (!isRecord(value)) return null;
  const id = value['id'];
  const title = value['title'];
  const subtitle = value['subtitle'];
  const icon = value['icon'];
  const figure = value['figure'];
  const detail = value['detail'];
  if (!isFilledString(id) || !isFilledString(title) || !isFilledString(subtitle)) return null;
  if (!isFilledString(icon) || !isFigureKind(figure) || !isFilledString(detail)) return null;
  return { id, title, subtitle, icon, figure, detail };
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
