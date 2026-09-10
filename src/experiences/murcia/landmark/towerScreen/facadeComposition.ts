/**
 * What a facade composition is, and the two helpers every one of them needs.
 *
 * NO `three` IMPORT, deliberately. A composition receives a 2D context and a
 * number and draws; it does not know it is a texture, and it could be drawn into
 * a page for proofing without a renderer existing. That boundary is the whole
 * reason `CanvasTexture` can later become a `WebGLRenderTarget` without a single
 * composition changing.
 *
 * ## Layout is in METRES, not pixels
 *
 * Every composition sizes and positions through `pxPerMetre`. The tower's
 * screen is a 42.8 m × 154 m surface in design metres, and the only question
 * that matters about a
 * heading is how tall it is ON THE BUILDING — a value in canvas pixels answers
 * that only for the resolution it was tuned at. This is the same split
 * `servicesDisplay` makes between its viewport and its type unit, for the same
 * reason: changing the texture resolution must not change the design.
 */

/** What `draw` receives. One frame, fully determined by `progress`. */
export interface FacadeFrame {
  readonly ctx: CanvasRenderingContext2D;
  /** Canvas size in pixels. Use it for full-bleed fills, not for layout. */
  readonly width: number;
  readonly height: number;
  /** Canvas pixels per real-world metre of facade. Lay out through this. */
  readonly pxPerMetre: number;
  /** The facade's real size, so a composition can reason about its own extent. */
  readonly metresWide: number;
  readonly metresTall: number;
  /** The only clock. 0 is inactive, 1 is the settled composition. */
  readonly progress: number;
}

export interface FacadeComposition {
  readonly id: string;
  /** Shown in the debug panel; never drawn. */
  readonly label: string;
  /**
   * Whether this composition changes ON ITS OWN at this progress — that is,
   * with `progress` held still.
   *
   * PART OF THE REDRAW GATE, and the narrower part. The facade already repaints
   * whenever progress moves, so a composition whose every motion comes from
   * progress answers `false` everywhere and costs nothing per frame once it has
   * settled. Answer `true` only for intrinsic motion, such as a value that ticks
   * while nothing else is happening; a composition that answers `true` forever
   * becomes the most expensive object in the scene.
   */
  isAnimating(progress: number): boolean;
  draw(frame: FacadeFrame): void;
  /**
   * Resolves whatever the composition cannot draw synchronously — today, images.
   *
   * Optional, idempotent, and never awaited by `draw`. A composition whose
   * assets have not arrived still draws a complete frame without them; the
   * facade repaints when this resolves. A missing photograph must never be able
   * to stall a frame.
   */
  load?(): Promise<void>;
  /** Releases what `load` acquired. Owned by whoever built the composition. */
  dispose?(): void;
  /**
   * The one thing a composition asks the MATERIAL to draw rather than drawing
   * itself. Null when no image in it is alive.
   */
  readonly dust?: DustSpec | null;
}

/**
 * Where a block sits and when it arrives.
 *
 * `at` is metres from the facade's TOP-LEFT, and for text `y` is the BASELINE —
 * the thing a designer positions against, and what the hand-written layout this
 * replaced already meant. `stage` is a window on the one progress clock.
 */
interface BlockBase {
  readonly at: readonly [number, number];
  readonly stage: readonly [number, number];
}

/**
 * The palette, named rather than spelled.
 *
 * `color` is the escape hatch and should stay one: a composition that names its
 * own hexes has left the design system, which is the thing this model exists to
 * prevent. It is here because a second service needs to be distinguishable from
 * the first at a glance while both are placeholders.
 */
interface TonedBlock {
  readonly tone?: 'ink' | 'accent' | 'muted';
  readonly color?: string;
}

/** Cap size in metres. A block's size is physical; pixels are the renderer's business. */
interface TextBlockBase extends BlockBase, TonedBlock {
  readonly text: string;
  readonly size: number;
  /** Letter-spacing in metres. Canvas has no tracking, and an eyebrow needs it. */
  readonly tracking?: number;
}

export interface EyebrowBlock extends TextBlockBase {
  readonly type: 'eyebrow';
}
export interface HeadlineBlock extends TextBlockBase {
  readonly type: 'headline';
}
export interface CaptionBlock extends TextBlockBase {
  readonly type: 'caption';
}

export interface MetricBlock extends BlockBase, TonedBlock {
  readonly type: 'metric';
  readonly value: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly size: number;
  /** Counts from zero across the window. `false` fades the final value in whole. */
  readonly countUp?: boolean;
}

export interface ListBlock extends BlockBase {
  readonly type: 'list';
  readonly items: readonly string[];
  readonly size: number;
  /** Metres between baselines. */
  readonly leading: number;
  /** Progress offset added per item, so the list reads as a list. */
  readonly stagger?: number;
  /**
   * How each item arrives. `fade` (the default) fades in with a small slide;
   * `wipe` is uncovered left to right across its own width, as if written.
   */
  readonly reveal?: 'fade' | 'wipe';
}

/**
 * The shapes the renderer can draw a series as.
 *
 * Declared here rather than beside the content schema because it is a statement
 * about the RENDERER's capability, and `content/facadeContent.ts` re-exports it
 * so the two cannot drift: the options a client sees in a dropdown are exactly
 * the cases `drawChart` handles, and adding a fourth is one switch away from
 * being offered.
 */
export type ChartKind = 'line' | 'bar' | 'area';

export interface ChartBlock extends BlockBase {
  readonly type: 'chart';
  /** Defaults to `'line'`, which is what every chart was before there was a choice. */
  readonly kind?: ChartKind;
  /** Box in metres. */
  readonly size: readonly [number, number];
  /**
   * Normalised 0..1 heights, evenly spaced. Two or more.
   *
   * HOW MANY is load-bearing, and differently per kind. `line` and `area` join
   * their points with straight segments, so a steep curve needs enough stations
   * that the chords do not visibly cut its corners — the strategy curve uses
   * seventeen for exactly that reason, and a pixel diff at nine showed the
   * chords as the only difference from the analytic version it replaced. `bar`
   * is the opposite: one bar per point, and past a dozen it reads as a comb.
   */
  readonly points: readonly number[];
  readonly axis?: boolean;
  readonly ticks?: number;
}

/**
 * A drifting mote field inside an image.
 *
 * Declared here as CONTENT — an image is or is not alive — but rendered by the
 * facade material, never by the canvas. Canvas motes would force a full repaint
 * and texture upload every frame for as long as the composition is shown, which
 * is exactly what the redraw gate exists to prevent; the scene already draws
 * every frame, so in the shader the same effect is free and, more importantly,
 * keeps moving once progress has settled.
 */
export interface DustOptions {
  /** Motes across the image's width. Higher is finer. */
  readonly density?: number;
  readonly strength?: number;
  readonly speed?: number;
}

export interface ImageBlock extends BlockBase {
  readonly type: 'image';
  readonly src: string;
  /** Box in metres. */
  readonly size: readonly [number, number];
  readonly fit?: 'cover' | 'contain';
  readonly dust?: DustOptions | true;
  /**
   * Metres over which every edge of the drawn picture fades to nothing. Absent
   * or 0 is a hard edge. Clamped to half the picture, where the four ramps meet.
   */
  readonly feather?: number;
}

/**
 * What the facade material needs in order to draw an image's dust.
 *
 * The rect is in METRES, like everything a spec declares; `mediaFacade` converts
 * to UV because it is the only thing that knows how many metres the screen is.
 */
export interface DustSpec {
  /** `[x, y, width, height]` in metres. */
  readonly rect: readonly [number, number, number, number];
  /** The image block's window, so dust arrives with the picture. */
  readonly stage: readonly [number, number];
  readonly density: number;
  readonly strength: number;
  readonly speed: number;
}

export interface RuleBlock extends BlockBase, TonedBlock {
  readonly type: 'rule';
  /** Length in metres. */
  readonly length: number;
  readonly weight?: number;
}

export type FacadeBlock =
  | EyebrowBlock
  | HeadlineBlock
  | CaptionBlock
  | MetricBlock
  | ListBlock
  | ChartBlock
  | ImageBlock
  | RuleBlock;

/**
 * A composition, as data.
 *
 * The whole point of the type: content, position and timing are declared, and
 * nothing here knows about a canvas. What this replaced was 214 lines of drawing
 * code per service carrying the same information in a form only its author could
 * retune.
 */
export interface CompositionSpec {
  readonly id: string;
  readonly label: string;
  /** Painted in order, so later blocks sit on top. */
  readonly blocks: readonly FacadeBlock[];
}

/**
 * Clamped remap — one clock, a window per element.
 *
 * The same helper `servicesDisplay` uses on the CPU and `reveal.vert` on the
 * GPU, and the reason a composition is scrubbable and reversible for free:
 * nothing here accumulates, so `draw` at a given progress always produces the
 * same frame no matter how it was reached.
 */
export function staged(value: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (value - from) / Math.max(to - from, 1e-4)));
}

/** Smoothstep. The house easing for a staged window. */
export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Complains when copy runs past the room it was given.
 *
 * Overflow on a canvas is silent — the glyphs are simply not there — and on a
 * 49 m facade the missing line is off the end of a building nobody is looking at.
 */
export function warnIfOverflowing(bottom: number, limit: number, what: string): void {
  if (bottom <= limit) return;
  console.warn(
    `[vertigo] ${what} runs ${Math.round(bottom - limit)}px past its room` +
      ` (${Math.round(bottom)} of ${Math.round(limit)}) and will be cut off`,
  );
}
