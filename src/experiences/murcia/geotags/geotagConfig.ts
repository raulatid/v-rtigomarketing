/**
 * The geotags' numbers: pins over the places in the city that open something.
 *
 * All provisional, pending a look on devices. World units are the city's.
 */
export interface GeotagConfig {
  /**
   * sRGB. The buildings' highlight colour (`BUILDING_HIGHLIGHT.color`), so the
   * pin and the blink read as one "this can be touched".
   */
  color: string;
  /**
   * The pin's height, tip to crown. FIXED in the world, deliberately: a pin
   * that kept its screen size would be a second mechanic, and the one case it
   * would help — a pin filling the screen up close — is already covered by
   * hiding it up close (`nearDistance`).
   */
  height: number;
  /** Gap between what the pin stands over and its tip. */
  clearance: number;
  /** A slow float, always on while shown. 0 turns it off. */
  floatAmplitude: number;
  floatPeriod: number;
  /** How far the pin rises at the peak of its site's highlight blink. */
  hopAmplitude: number;
  /**
   * Camera distance, to the pin, below which it is hidden and above which it
   * is fully shown. Faded in between. A pin says "over there"; next to the
   * place it has nothing left to say.
   */
  nearDistance: number;
  farDistance: number;
  /** Seconds for a full fade, in or out, when navigation starts or stops. */
  fadeSeconds: number;
}

export const GEOTAG: GeotagConfig = {
  // Restated, like the highlight restates the CSS accent: a change there must land here too.
  color: '#1c67ff',
  height: 18,
  clearance: 6,
  floatAmplitude: 1.2,
  floatPeriod: 3,
  hopAmplitude: 4,
  nearDistance: 250,
  farDistance: 350,
  fadeSeconds: 0.4,
};

/**
 * How far above the blog panel's CENTRE its top edge sits: half of its 24-unit
 * height (`blogDisplay.ts`, `PANEL_HEIGHT`) at its 45° lean
 * (`PANEL_TILT_DEGREES`). The pin stands on that, not on the cluster, so the
 * panel never hides it.
 */
export const BLOG_PANEL_HALF_RISE = 12 * Math.sin(Math.PI / 4);
