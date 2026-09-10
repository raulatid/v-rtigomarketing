/**
 * The field checks both content shapes share.
 *
 * Everything here narrows `unknown`: the input is outside the build, so every
 * guarantee has to be re-established by hand. Shared rather than duplicated so
 * a template's field and a freeform block can never disagree about what, say, a
 * valid chart series is.
 */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Blank copy is a mistake, not a value: on a 49 m facade it is a hole. */
export const isFilledString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Marks along a chart's baseline. Past two dozen they are a hatch, not a scale. */
export const isTickCount = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 1 && value <= 24;

/** A non-empty list in which every entry is filled copy, or `null`. */
export function parseFilledStrings(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;

  const list: readonly unknown[] = value;
  const strings = list.filter(isFilledString);
  if (strings.length !== list.length || strings.length === 0) return null;
  return strings;
}

/**
 * A chart series: two or more normalised 0..1 heights, or `null`.
 *
 * Every entry has to be a number, and heights are NORMALISED — a client who
 * typed a revenue figure rather than a fraction would draw a line kilometres
 * above the roof, silently, since the renderer does not clip to the box.
 */
export function parsePoints(value: unknown): readonly number[] | null {
  if (!Array.isArray(value)) return null;

  const list: readonly unknown[] = value;
  const points = list.filter(isFiniteNumber);
  if (points.length !== list.length || points.length < 2) return null;
  if (points.some((point) => point < 0 || point > 1)) return null;
  return points;
}
