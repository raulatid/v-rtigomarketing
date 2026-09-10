import type { DustOptions, FacadeBlock } from '../facadeComposition';
import {
  isFiniteNumber,
  isFilledString,
  isRecord,
  isTickCount,
  parseFilledStrings,
  parsePoints,
} from './guards';

/**
 * Layout as data: `FacadeBlock`s straight out of a document.
 *
 * What the `freeform` template reads. Every other template declares only what
 * is said and leaves every metre to `composeFacade`; a freeform composition
 * declares the blocks themselves — position, cap size, tracking and reveal
 * window — which is what lets a layout be authored in Sanity rather than in
 * TypeScript.
 *
 * The same stance as `loadFacadeContent`: total, throws for nothing, and
 * returns a whole value or `null`. One bad block rejects the list, and the
 * list rejects its document set, so a typo shows the bundled facade with one
 * warning rather than a composition with a hole in it.
 *
 * ## Layout opens, the palette does not
 *
 * `color` is REJECTED, not ignored. `TonedBlock.color` is the escape hatch
 * `facadeComposition.ts` asks to stay one, and a document that could name hexes
 * would have left the design system through the front door. Freeform blocks
 * choose a `tone`; the renderer owns what a tone looks like.
 */

type Pair = readonly [number, number];

const isPositive = (value: unknown): value is number => isFiniteNumber(value) && value > 0;

const isOptionalPositive = (value: unknown): value is number | undefined =>
  value === undefined || isPositive(value);

const isOptionalNonNegative = (value: unknown): value is number | undefined =>
  value === undefined || (isFiniteNumber(value) && value >= 0);

const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === 'boolean';

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

function parsePair(value: unknown): Pair | null {
  if (!Array.isArray(value) || value.length !== 2) return null;

  const list: readonly unknown[] = value;
  const [a, b] = list;
  return isFiniteNumber(a) && isFiniteNumber(b) ? [a, b] : null;
}

/** Metres from the facade's top-left. Negative would start off the building. */
function parseAt(value: unknown): Pair | null {
  const at = parsePair(value);
  return at && at[0] >= 0 && at[1] >= 0 ? at : null;
}

/** A window on the one progress clock: `0 ≤ from < to ≤ 1`. */
function parseStage(value: unknown): Pair | null {
  const stage = parsePair(value);
  return stage && stage[0] >= 0 && stage[0] < stage[1] && stage[1] <= 1 ? stage : null;
}

/** A box in metres. A zero-sized box draws nothing and says nothing about why. */
function parseBox(value: unknown): Pair | null {
  const box = parsePair(value);
  return box && box[0] > 0 && box[1] > 0 ? box : null;
}

function parseDust(value: unknown): DustOptions | true | null {
  if (value === true) return true;
  if (!isRecord(value)) return null;

  const density = value['density'];
  const strength = value['strength'];
  const speed = value['speed'];
  if (!isOptionalPositive(density) || !isOptionalPositive(strength) || !isOptionalPositive(speed)) {
    return null;
  }

  return {
    ...(density === undefined ? {} : { density }),
    ...(strength === undefined ? {} : { strength }),
    ...(speed === undefined ? {} : { speed }),
  };
}

interface Placement {
  readonly at: Pair;
  readonly stage: Pair;
}

interface Toned {
  readonly tone?: 'ink' | 'accent' | 'muted';
}

function parseText(
  value: Record<string, unknown>,
  type: 'eyebrow' | 'headline' | 'caption',
  placement: Placement,
  toned: Toned,
): FacadeBlock | null {
  const text = value['text'];
  const size = value['size'];
  const tracking = value['tracking'];
  if (!isFilledString(text) || !isPositive(size) || !isOptionalNonNegative(tracking)) return null;

  return {
    type,
    text,
    size,
    ...placement,
    ...toned,
    // Spread rather than assigned: `exactOptionalPropertyTypes` refuses an
    // explicit `undefined`, and an absent field must stay absent.
    ...(tracking === undefined ? {} : { tracking }),
  };
}

function parseMetric(
  value: Record<string, unknown>,
  placement: Placement,
  toned: Toned,
): FacadeBlock | null {
  const amount = value['value'];
  const size = value['size'];
  const prefix = value['prefix'];
  const suffix = value['suffix'];
  const countUp = value['countUp'];
  if (!isFiniteNumber(amount) || !isPositive(size)) return null;
  if (!isOptionalString(prefix) || !isOptionalString(suffix) || !isOptionalBoolean(countUp)) {
    return null;
  }

  return {
    type: 'metric',
    value: amount,
    size,
    ...placement,
    ...toned,
    ...(prefix === undefined ? {} : { prefix }),
    ...(suffix === undefined ? {} : { suffix }),
    ...(countUp === undefined ? {} : { countUp }),
  };
}

function parseList(value: Record<string, unknown>, placement: Placement): FacadeBlock | null {
  const items = parseFilledStrings(value['items']);
  const size = value['size'];
  const leading = value['leading'];
  const stagger = value['stagger'];
  if (!items || !isPositive(size) || !isPositive(leading) || !isOptionalNonNegative(stagger)) {
    return null;
  }

  const reveal = value['reveal'];
  if (reveal !== undefined && reveal !== 'fade' && reveal !== 'wipe') return null;

  return {
    type: 'list',
    items,
    size,
    leading,
    ...placement,
    ...(stagger === undefined ? {} : { stagger }),
    ...(reveal === undefined ? {} : { reveal }),
  };
}

function parseChart(value: Record<string, unknown>, placement: Placement): FacadeBlock | null {
  const kind = value['kind'];
  if (kind !== undefined && kind !== 'line' && kind !== 'bar' && kind !== 'area') return null;

  const size = parseBox(value['size']);
  const points = parsePoints(value['points']);
  const axis = value['axis'];
  const ticks = value['ticks'];
  if (!size || !points || !isOptionalBoolean(axis)) return null;
  if (ticks !== undefined && !isTickCount(ticks)) return null;

  return {
    type: 'chart',
    size,
    points,
    ...placement,
    ...(kind === undefined ? {} : { kind }),
    ...(axis === undefined ? {} : { axis }),
    ...(ticks === undefined ? {} : { ticks }),
  };
}

function parseImage(value: Record<string, unknown>, placement: Placement): FacadeBlock | null {
  const src = value['src'];
  const size = parseBox(value['size']);
  if (!isFilledString(src) || !size) return null;

  const fit = value['fit'];
  if (fit !== undefined && fit !== 'cover' && fit !== 'contain') return null;

  const rawDust = value['dust'];
  const dust = rawDust === undefined ? undefined : parseDust(rawDust);
  if (dust === null) return null;

  const feather = value['feather'];
  if (!isOptionalNonNegative(feather)) return null;

  return {
    type: 'image',
    src,
    size,
    ...placement,
    ...(fit === undefined ? {} : { fit }),
    ...(dust === undefined ? {} : { dust }),
    ...(feather === undefined ? {} : { feather }),
  };
}

function parseRule(
  value: Record<string, unknown>,
  placement: Placement,
  toned: Toned,
): FacadeBlock | null {
  const length = value['length'];
  const weight = value['weight'];
  if (!isPositive(length) || !isOptionalPositive(weight)) return null;

  return {
    type: 'rule',
    length,
    ...placement,
    ...toned,
    ...(weight === undefined ? {} : { weight }),
  };
}

function parseBlock(value: unknown): FacadeBlock | null {
  if (!isRecord(value)) return null;
  if (value['color'] !== undefined) return null;

  const at = parseAt(value['at']);
  const stage = parseStage(value['stage']);
  if (!at || !stage) return null;
  const placement: Placement = { at, stage };

  const tone = value['tone'];
  if (tone !== undefined && tone !== 'ink' && tone !== 'accent' && tone !== 'muted') return null;
  const toned: Toned = tone === undefined ? {} : { tone };

  const type = value['type'];
  switch (type) {
    case 'eyebrow':
    case 'headline':
    case 'caption':
      return parseText(value, type, placement, toned);
    case 'metric':
      return parseMetric(value, placement, toned);
    case 'list':
      return parseList(value, placement);
    case 'chart':
      return parseChart(value, placement);
    case 'image':
      return parseImage(value, placement);
    case 'rule':
      return parseRule(value, placement, toned);
    default:
      return null;
  }
}

/**
 * A freeform composition's `blocks`, validated — or `null`.
 *
 * Non-empty: a composition with nothing in it is a blank building, which is
 * indistinguishable from a broken renderer.
 */
export function parseBlocks(value: unknown): readonly FacadeBlock[] | null {
  if (!Array.isArray(value)) return null;

  const list: readonly unknown[] = value;
  if (list.length === 0) return null;

  const blocks: FacadeBlock[] = [];
  for (const entry of list) {
    const block = parseBlock(entry);
    if (!block) return null;
    blocks.push(block);
  }
  return blocks;
}
