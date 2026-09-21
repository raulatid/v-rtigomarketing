import type { CampusFraming } from './section/campusCamera';

export const CAMPUS_DOCK_QUERY = '(min-width: 1024px) and (min-aspect-ratio: 4/3)';

/**
 * How much of the viewport's height the reading sheet takes at its compact
 * stop, and therefore how much is left above it for the particle field. The two
 * are ONE number: `campusMobileFraming` reserves the field's band by
 * subtracting the sheet, so raising the sheet never covers the particles — it
 * pulls the camera back and makes them smaller.
 *
 * ── Why it is derived per viewport rather than fixed ──
 *
 * It was a flat 0.35 (client, 2026-09-16). That number had to be safe on the
 * smallest phone, so on every larger one it left the field with room nobody was
 * using and the sheet hidden lower than it needed to be. Measured at 0.35:
 *
 *     390x844   distanceScale 1.60  <- at the floor, 0.104 of height spare
 *     375x667   distanceScale 1.60  <- at the floor, 0.059 spare
 *     320x568   distanceScale 1.60  <- at the floor, 0.021 spare
 *     844x390   distanceScale 1.84  <- the height already binds
 *
 * Three of the four sit AT `SCALE_FLOOR`, which means the band is larger than
 * the field can use: the camera is not being held back by the space, it is
 * being held at its own nearest distance. Every pixel of that slack can go to
 * the sheet for free. `campusCompactFraction` spends exactly it, and not one
 * pixel more — the fraction it returns is the largest for which
 * `campusMobileFraming` still resolves to the same `distanceScale` it would at
 * the minimum.
 *
 * So a phone gets a sheet at ~0.45 and the same particles it has today; a
 * 320-wide one gets ~0.37; a phone in landscape, where the height already
 * binds, gets the minimum and is unchanged. Nothing anywhere gets smaller than
 * it is now, which is the property the clamp below guarantees rather than
 * argues.
 */
export const CAMPUS_COMPACT_MIN_FRACTION = 0.35;

/**
 * And the ceiling, which is a judgement rather than a derivation.
 *
 * The slack runs out around 0.45 on a tall phone, but a portrait tablet — which
 * is also on this layout — has enough for 0.48, and half the screen of reading
 * sheet over a lake is a different composition, not a taller peek. 0.45 is what
 * the reference phone earns; nothing needs more than the device the framing was
 * judged on.
 */
export const CAMPUS_COMPACT_MAX_FRACTION = 0.45;

/**
 * The numbers `campusMobileFraming` is built from, named because
 * `campusCompactFraction` has to invert the same arithmetic. Written twice they
 * would drift, and the drift would be silent: the fraction would claim slack
 * the framing does not have, and the particles would quietly shrink.
 */
/** The disc's projected diameter at the tuned distance, in viewport heights. */
const DISC_HEIGHTS = 0.6;
/** The camera will not come nearer than this multiple of the tuned distance. */
const SCALE_FLOOR = 1.6;
/** Clear air between the bottom of the field and the top of the sheet. */
const SHEET_GAP = 24;
/** The field's own margin inside its band, and the side inset it keeps. */
const FIELD_PAD = 32;
const SIDE_INSET = 48;
/** Nothing is ever framed into less than this, however little is left. */
const MIN_SPAN = 48;

/** Where the field's band starts: under the header, capped so a tall phone does not waste it. */
const bandTop = (height: number): number => Math.min(88, height * 0.18);

/** What the frame's WIDTH asks of the distance, which the sheet cannot change. */
const widthDemand = (width: number, height: number): number =>
  (DISC_HEIGHTS * height) / Math.max(MIN_SPAN, width - SIDE_INSET);

/** What the band's HEIGHT asks of it, which is the half the sheet competes for. */
const heightDemand = (height: number, available: number): number =>
  (DISC_HEIGHTS * height) / Math.max(MIN_SPAN, available - FIELD_PAD);

/**
 * The largest compact stop this viewport can afford without moving the camera.
 *
 * Inverts `campusMobileFraming`'s own maths: the distance is the largest of
 * three demands, two of which the sheet cannot touch (the floor, and the
 * frame's width). So the sheet may grow until the band's height demands as much
 * as the larger of those two — past that point the height wins and the field
 * starts shrinking.
 *
 * Clamped at both ends. The floor is the fraction that shipped, so a viewport
 * with no slack — a phone in landscape, where the height already binds — is
 * left exactly as it is rather than having its sheet LOWERED to buy particles
 * nobody asked to be bigger.
 */
export function campusCompactFraction(width: number, height: number): number {
  if (!(width > 0 && height > 0)) return CAMPUS_COMPACT_MIN_FRACTION;
  const unbeatable = Math.max(SCALE_FLOOR, widthDemand(width, height));
  // The band at which `heightDemand` would exactly equal that, and so the last
  // one where the sheet is still free.
  const needed = (DISC_HEIGHTS * height) / unbeatable + FIELD_PAD;
  const fraction = 1 - (needed + SHEET_GAP + bandTop(height)) / height;
  return Math.min(
    CAMPUS_COMPACT_MAX_FRACTION,
    Math.max(CAMPUS_COMPACT_MIN_FRACTION, fraction),
  );
}

/** Frame the whole particle field inside the space above the compact sheet.
 * Expanding the reading panel deliberately does not move this camera. */
export function campusMobileFraming(width: number, height: number): CampusFraming {
  const top = bandTop(height);
  const bottom = height * (1 - campusCompactFraction(width, height)) - SHEET_GAP;
  const available = Math.max(MIN_SPAN, bottom - top);
  return {
    x: 0,
    y: 1 - (top + bottom) / height,
    distanceScale: Math.max(
      SCALE_FLOOR,
      widthDemand(width, height),
      heightDemand(height, available),
    ),
  };
}
