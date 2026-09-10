import {
  easeInOut,
  staged,
  warnIfOverflowing,
  type CaptionBlock,
  type ChartBlock,
  type CompositionSpec,
  type DustSpec,
  type EyebrowBlock,
  type FacadeBlock,
  type FacadeComposition,
  type FacadeFrame,
  type HeadlineBlock,
  type ImageBlock,
  type ListBlock,
  type MetricBlock,
  type RuleBlock,
} from './facadeComposition';

/**
 * Turns a composition spec into something the facade can draw.
 *
 * THE ONLY FILE HERE THAT TOUCHES A 2D CONTEXT. Compositions used to be
 * hand-written draw functions — 214 lines and sixty `ctx.` calls for one
 * service, with content, position and timing fused together and nothing
 * reusable between them. Everything that was inline in each of them now lives
 * here once: the type scale, the tracking, the staged reveals, the chart, the
 * stagger. A spec declares what and where; this decides how.
 *
 * The trade is real and worth stating: a bespoke draw function can do anything,
 * and a block can only do what this file supports. That is the intended
 * direction — a facade whose compositions differ arbitrarily is not a design
 * system, it is eight unrelated pictures.
 */

const INK = '#eaf6ff';
const ACCENT = '#5ad1ff';
const MUTED = '#7e93a6';
/** The unlit surface. Near-black, so an inactive facade reads as architecture. */
const BASE = '#05070a';

const AXIS = '#25333f';
const HAIRLINE = '#1d2a35';

/** One family, three weights. Registered by `mediaFacade` before the first paint. */
export const FACADE_FONT_STACK = "'Vertigo Facade Inter', ui-sans-serif, system-ui, sans-serif";

const TONES = { ink: INK, accent: ACCENT, muted: MUTED } as const;

const colorOf = (
  block: { tone?: 'ink' | 'accent' | 'muted'; color?: string },
  fallback: 'ink' | 'accent' | 'muted' = 'ink',
): string => block.color ?? TONES[block.tone ?? fallback];

/**
 * Cap size in metres to a canvas font.
 *
 * `size` is CAP HEIGHT, not em size, because a designer measures the letter and
 * not the invisible box around it. Inter's cap height is 0.727 em, so the em
 * size is the cap divided by that — which is why `1.6 m` of heading is 2.2 m of
 * font. Getting this wrong makes every metre in every spec a lie.
 */
const CAP_TO_EM = 1 / 0.727;

function font(ctx: CanvasRenderingContext2D, capMetres: number, weight: number, m: number): void {
  ctx.font = `${weight} ${Math.round(capMetres * CAP_TO_EM * m)}px ${FACADE_FONT_STACK}`;
}

/** Letter-spaced draw. Returns the x it ended at. */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): number {
  if (tracking <= 0) {
    ctx.fillText(text, x, y);
    return x + ctx.measureText(text).width;
  }
  let cursor = x;
  for (const character of text) {
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + tracking;
  }
  return cursor - tracking;
}

/** A block's own 0..1, eased. Everything staged goes through here. */
const reveal = (block: { stage: readonly [number, number] }, progress: number): number =>
  easeInOut(staged(progress, block.stage[0], block.stage[1]));

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function drawText(
  frame: FacadeFrame,
  block: EyebrowBlock | HeadlineBlock | CaptionBlock,
  weight: number,
  rise: number,
): void {
  const { ctx, pxPerMetre: m } = frame;
  const t = reveal(block, frame.progress);
  if (t <= 0) return;

  ctx.globalAlpha = t;
  ctx.fillStyle = colorOf(block);
  font(ctx, block.size, weight, m);
  // Rises as it arrives, so type lands rather than blinks.
  const y = (block.at[1] - (1 - t) * rise) * m;
  drawTracked(ctx, block.text, block.at[0] * m, y, (block.tracking ?? 0) * m);
  ctx.globalAlpha = 1;

  warnIfOverflowing(y, frame.metresTall * m, `"${block.text}"`);
}

function drawMetric(frame: FacadeFrame, block: MetricBlock): void {
  const { ctx, pxPerMetre: m } = frame;
  const t = reveal(block, frame.progress);
  if (t <= 0) return;

  const shown = block.countUp === false ? block.value : Math.round(block.value * t);
  // Reaches full opacity before it reaches its value, so the number is being
  // read while it is still counting rather than fading and counting at once.
  ctx.globalAlpha = Math.min(1, t * 1.6);
  ctx.fillStyle = colorOf(block, 'accent');
  font(ctx, block.size, 700, m);
  ctx.fillText(
    `${block.prefix ?? ''}${shown}${block.suffix ?? ''}`,
    block.at[0] * m,
    block.at[1] * m,
  );
  ctx.globalAlpha = 1;
}

function drawList(frame: FacadeFrame, block: ListBlock): void {
  const { ctx, pxPerMetre: m } = frame;
  const stagger = block.stagger ?? 0;

  block.items.forEach((item, i) => {
    const t = easeInOut(
      staged(frame.progress, block.stage[0] + i * stagger, block.stage[1] + i * stagger),
    );
    if (t <= 0) return;
    // The first item carries the emphasis; the rest are the vocabulary around it.
    ctx.fillStyle = i === 0 ? INK : MUTED;
    font(ctx, block.size, 500, m);
    const x = block.at[0] * m;
    const y = (block.at[1] + i * block.leading) * m;

    if (block.reveal === 'wipe') {
      // Uncovered left to right at full strength, the way the image wipes. The
      // clip is generous vertically so accents and descenders are never cut:
      // only its width moves.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y - block.size * 2 * m, ctx.measureText(item).width * t, block.size * 3 * m);
      ctx.clip();
      ctx.fillText(item, x, y);
      ctx.restore();
      return;
    }

    ctx.globalAlpha = t;
    ctx.fillText(item, x + (1 - t) * 0.25 * m, y);
    ctx.globalAlpha = 1;
  });
}

/**
 * The chart's box, in pixels, resolved once and handed to whichever kind draws.
 *
 * Every kind sits in the same box on the same baseline and fills it over the
 * same window, which is what makes the choice between them a content decision
 * rather than a redesign: switching `line` to `bar` must move nothing else on
 * the facade.
 */
interface ChartBox {
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
}

/**
 * Samples a point list, interpolating between stations.
 *
 * Shared by `line` and `area` because they are the same geometry twice — an
 * area is a line with the space beneath it claimed.
 */
function sampler(
  points: readonly number[],
  box: ChartBox,
): (t: number) => readonly [number, number] {
  return (t) => {
    const span = (points.length - 1) * t;
    const i = Math.min(points.length - 2, Math.floor(span));
    const f = span - i;
    const a = points[i] ?? 0;
    const b = points[i + 1] ?? a;
    return [box.left + box.width * t, box.bottom - (a + (b - a) * f) * (box.bottom - box.top)];
  };
}

/** How many samples a drawn curve is walked at, whatever its station count. */
const CURVE_STEPS = 64;

/**
 * `line`, and `area` when it is asked to claim the space underneath.
 *
 * A real partial path rather than a clipped one, so the line's leading end is
 * where the data actually stops.
 */
function drawSeries(
  frame: FacadeFrame,
  block: ChartBlock,
  box: ChartBox,
  curve: number,
  filled: boolean,
): void {
  const { ctx, pxPerMetre: m, progress } = frame;
  const at = sampler(block.points, box);

  const path = new Path2D();
  for (let i = 0; i <= CURVE_STEPS; i++) {
    const [px, py] = at((i / CURVE_STEPS) * curve);
    if (i === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  }

  if (filled) {
    // Closed down to the baseline and back, so the fill is the area under the
    // curve and not the shape the curve happens to enclose. Its own path:
    // closing the stroked one would draw the baseline twice, over the axis.
    const area = new Path2D(path);
    const [endX] = at(curve);
    area.lineTo(endX, box.bottom);
    area.lineTo(box.left, box.bottom);
    area.closePath();

    // Low enough that the LED field reads through it. A solid fill on an
    // emissive surface stops being a chart and becomes a lit panel.
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = ACCENT;
    ctx.fill(area);
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = Math.max(2, 0.075 * m);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(path);

  // A head on the line while it is still moving, gone once it settles.
  const head = 1 - easeInOut(staged(progress, block.stage[1] - 0.06, block.stage[1] + 0.04));
  if (head > 0) {
    const [hx, hy] = at(curve);
    ctx.globalAlpha = head;
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(hx, hy, 0.13 * m, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** Portion of a bar's slot given over to the gap beside it. */
const BAR_GAP = 0.32;
/** Past this many, bars stop being countable at facade distance. */
const MAX_BARS = 12;
/** Of the reveal window, how much is spent staggering rather than growing. */
const BAR_STAGGER = 0.8;

/**
 * `bar` — one bar per station, growing from the baseline.
 *
 * Each bar takes its own slice of the SAME `curve` value the line is drawn
 * with, so the two kinds finish together and the composition's timing does not
 * change when the content switches between them. No head: the head marks where
 * a line has got to, and a bar chart's leading edge is a whole bar.
 */
function drawBars(frame: FacadeFrame, block: ChartBlock, box: ChartBox, curve: number): void {
  const { ctx } = frame;
  const count = block.points.length;
  const slot = box.width / count;
  const width = Math.max(1, slot * (1 - BAR_GAP));
  const span = box.bottom - box.top;
  const grow = 1 - BAR_STAGGER;

  ctx.fillStyle = ACCENT;
  for (let i = 0; i < count; i++) {
    const start = (i / count) * BAR_STAGGER;
    const t = easeInOut(staged(curve, start, start + grow));
    if (t <= 0) continue;

    const height = (block.points[i] ?? 0) * span * t;
    ctx.fillRect(box.left + i * slot + (slot - width) / 2, box.bottom - height, width, height);
  }
}

function drawChart(frame: FacadeFrame, block: ChartBlock): void {
  const { ctx, pxPerMetre: m, progress } = frame;
  const [x0, y0] = block.at;
  const [w, h] = block.size;
  const left = x0 * m;
  const top = y0 * m;
  const bottom = (y0 + h) * m;
  const width = w * m;

  // The architecture of the chart before any data is claimed: the baseline
  // draws over the first 40% of the window, the curve over the rest. A
  // per-type convention, so a spec stays two lines.
  const split = block.stage[0] + (block.stage[1] - block.stage[0]) * 0.4;
  const axis = easeInOut(staged(progress, block.stage[0], split));
  const curve = easeInOut(staged(progress, split * 0.95, block.stage[1]));

  if ((block.axis ?? true) && axis > 0) {
    ctx.strokeStyle = AXIS;
    ctx.lineWidth = Math.max(1, 0.035 * m);
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(left + width * axis, bottom);
    ctx.stroke();

    const ticks = block.ticks ?? 4;
    for (let i = 1; i <= ticks; i++) {
      const t = i / ticks;
      if (t > axis) break;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(left + width * t, bottom);
      ctx.lineTo(left + width * t, bottom - 0.22 * m);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  if (curve <= 0 || block.points.length < 2) return;

  // Which shape the same numbers take. The one line in this file that a
  // content author controls, and the reason `ChartKind` is declared beside the
  // block rather than beside the schema.
  const box: ChartBox = { left, top, bottom, width };
  switch (block.kind ?? 'line') {
    case 'line':
      return drawSeries(frame, block, box, curve, false);
    case 'area':
      return drawSeries(frame, block, box, curve, true);
    case 'bar':
      return drawBars(frame, block, box, curve);
  }
}

function drawRule(frame: FacadeFrame, block: RuleBlock): void {
  const { ctx, pxPerMetre: m } = frame;
  const t = reveal(block, frame.progress);
  if (t <= 0) return;

  // A rule with no tone named is structure, not content, so it defaults to the
  // hairline rather than to ink.
  ctx.strokeStyle = block.tone ?? block.color ? colorOf(block) : HAIRLINE;
  ctx.lineWidth = Math.max(1, (block.weight ?? 0.03) * m);
  ctx.beginPath();
  ctx.moveTo(block.at[0] * m, block.at[1] * m);
  ctx.lineTo((block.at[0] + block.length * t) * m, block.at[1] * m);
  ctx.stroke();
}

/** Stops per feather ramp. Enough that the eased curve shows no linear kinks. */
const FEATHER_STOPS = 8;

/**
 * An alpha ramp across `length` px that eases in over `feather` px at both ends.
 *
 * Eased rather than linear because a linear alpha ramp ends in a visible crease
 * where it meets full opacity — the Mach band a feather exists to avoid.
 */
function featherGradient(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  length: number,
  feather: number,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, 0, x1, y1);
  const reach = feather / length;
  for (let i = 0; i <= FEATHER_STOPS; i++) {
    const t = i / FEATHER_STOPS;
    const alpha = `rgba(0,0,0,${easeInOut(t)})`;
    gradient.addColorStop(t * reach, alpha);
    gradient.addColorStop(1 - t * reach, alpha);
  }
  return gradient;
}

/**
 * Draws the picture into `scratch` and fades its four edges there.
 *
 * On a scratch canvas because a mask on the facade canvas itself would fade
 * whatever the composition painted underneath too. Two `destination-in` passes,
 * one per axis, multiply into a feathered rectangle.
 */
function featheredImage(
  scratch: HTMLCanvasElement,
  image: HTMLImageElement,
  source: readonly [number, number, number, number],
  width: number,
  height: number,
  feather: number,
): CanvasImageSource | null {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  const s = scratch.getContext('2d');
  if (!s) return null;

  s.globalCompositeOperation = 'source-over';
  s.clearRect(0, 0, w, h);
  s.drawImage(image, source[0], source[1], source[2], source[3], 0, 0, w, h);

  s.globalCompositeOperation = 'destination-in';
  s.fillStyle = featherGradient(s, w, 0, w, feather);
  s.fillRect(0, 0, w, h);
  s.fillStyle = featherGradient(s, 0, h, h, feather);
  s.fillRect(0, 0, w, h);
  s.globalCompositeOperation = 'source-over';
  return scratch;
}

function drawImage(
  frame: FacadeFrame,
  block: ImageBlock,
  image: HTMLImageElement | undefined,
  scratch: () => HTMLCanvasElement,
): void {
  // NOT AN ERROR, and not a stall: the asset may still be decoding. The frame is
  // drawn without it and the facade repaints when it lands.
  if (!image) return;

  const { ctx, pxPerMetre: m } = frame;
  const t = reveal(block, frame.progress);
  if (t <= 0) return;

  const [x0, y0] = block.at;
  const [w, h] = block.size;
  const boxX = x0 * m;
  const boxY = y0 * m;
  const boxW = w * m;
  const boxH = h * m;

  /**
   * The two fits crop DIFFERENT rectangles, which is the whole distinction.
   *
   * `cover` fills the box and crops the source — centre the source rectangle and
   * let the destination be the box. `contain` shows the whole source and shrinks
   * the DESTINATION to the image's aspect, centred in the box.
   *
   * Computing both in the source, as this first did, gives `contain` an uncropped
   * source drawn to the full box — which is `fill`, and stretches. It went
   * unnoticed because nothing used `contain` until a wordmark did, and a stretched
   * logo is the first thing anyone sees.
   */
  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;
  let dx = boxX;
  let dy = boxY;
  let dw = boxW;
  let dh = boxH;

  if ((block.fit ?? 'cover') === 'cover') {
    const scale = Math.max(boxW / image.width, boxH / image.height);
    sw = Math.min(image.width, boxW / scale);
    sh = Math.min(image.height, boxH / scale);
    sx = (image.width - sw) / 2;
    sy = (image.height - sh) / 2;
  } else {
    const scale = Math.min(boxW / image.width, boxH / image.height);
    dw = image.width * scale;
    dh = image.height * scale;
    dx = boxX + (boxW - dw) / 2;
    dy = boxY + (boxH - dh) / 2;
  }

  ctx.save();
  ctx.globalAlpha = t;
  // A wipe as well as a fade, so the visual arrives like the rest of the
  // composition rather than simply switching on. Clipped to the BOX, not the
  // drawn rectangle, so a letterboxed image still wipes across its full slot.
  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW * t, boxH);
  ctx.clip();

  // Feathered around the DRAWN rectangle, not the box: under `contain` the box
  // can be wider than the picture, and a fade across empty space fades nothing.
  const feather = Math.min((block.feather ?? 0) * m, dw / 2, dh / 2);
  const faded =
    feather >= 1 ? featheredImage(scratch(), image, [sx, sy, sw, sh], dw, dh, feather) : null;
  if (faded) ctx.drawImage(faded, 0, 0, Math.ceil(dw), Math.ceil(dh), dx, dy, dw, dh);
  else ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * Loads a bitmap that is ready to be DRAWN.
 *
 * `decode()` rather than an `onload` promise: `load` only promises the bytes
 * were parsed, while `decode` resolves when `drawImage` will not block. The
 * distinction is the same one `blog-transition/pageRaster.ts` documents.
 */
async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

// ---------------------------------------------------------------------------

export function createComposition(spec: CompositionSpec): FacadeComposition {
  /**
   * Owned per composition rather than in a module-level cache, so disposal is
   * unambiguous: whoever built this composition frees exactly these bitmaps.
   */
  const images = new Map<string, HTMLImageElement>();
  const failed = new Set<string>();
  let loading: Promise<void> | null = null;

  /**
   * Where a feathered image is masked before it reaches the facade. One per
   * composition, created on first use and shared by its images: they are drawn
   * one after another, so nothing ever needs two at once.
   */
  let scratchCanvas: HTMLCanvasElement | null = null;
  const scratch = (): HTMLCanvasElement => (scratchCanvas ??= document.createElement('canvas'));

  const imageBlocks = spec.blocks.filter((block): block is ImageBlock => block.type === 'image');
  const sources = imageBlocks.map((block) => block.src);

  /**
   * The first image asking for dust wins.
   *
   * One field per composition, not one per image: the material carries a single
   * rect per canvas slot, and a second would double the uniforms to serve a case
   * no composition has. Warned about rather than silently dropped, because
   * "my dust did not appear" is otherwise unexplainable.
   */
  const dusty = imageBlocks.filter((block) => block.dust);
  if (dusty.length > 1) {
    console.warn(
      `[vertigo] "${spec.id}" asks for dust on ${dusty.length} images;` +
        ' the facade draws one field, so only the first is used',
    );
  }
  const dustBlock = dusty[0];
  const dustOptions = dustBlock?.dust === true ? {} : dustBlock?.dust;
  const dust: DustSpec | null = dustBlock
    ? {
        rect: [dustBlock.at[0], dustBlock.at[1], dustBlock.size[0], dustBlock.size[1]],
        stage: dustBlock.stage,
        density: dustOptions?.density ?? 7,
        strength: dustOptions?.strength ?? 1,
        speed: dustOptions?.speed ?? 1,
      }
    : null;

  /**
   * Checked once at build time, never per frame.
   *
   * A line wants many stations and a bar chart wants few, and the same array
   * feeds both — so switching `line` to `bar` on a seventeen-point series is a
   * one-word edit that produces a comb. Silent, too: it draws perfectly, it
   * just says nothing. Warned about in the manner of `warnIfOverflowing`,
   * because a design failure nobody can see reported is one that ships.
   */
  for (const block of spec.blocks) {
    if (block.type !== 'chart' || (block.kind ?? 'line') !== 'bar') continue;
    if (block.points.length <= MAX_BARS) continue;
    console.warn(
      `[vertigo] "${spec.id}" draws ${block.points.length} bars;` +
        ` past ${MAX_BARS} they read as a texture rather than a comparison`,
    );
  }

  const drawBlock = (frame: FacadeFrame, block: FacadeBlock): void => {
    switch (block.type) {
      case 'eyebrow':
        return drawText(frame, block, 600, 0.12);
      case 'headline':
        return drawText(frame, block, 700, 0.18);
      case 'caption':
        return drawText(frame, block, 500, 0);
      case 'metric':
        return drawMetric(frame, block);
      case 'list':
        return drawList(frame, block);
      case 'chart':
        return drawChart(frame, block);
      case 'rule':
        return drawRule(frame, block);
      case 'image':
        return drawImage(frame, block, images.get(block.src), scratch);
    }
  };

  return {
    id: spec.id,
    label: spec.label,
    dust,

    // Every motion the CANVAS carries comes from progress, so at a held progress
    // this frame is final and the facade stops paying for it. Dust is the
    // exception that proves the rule: it moves at rest, which is exactly why it
    // is the material's job and not this file's.
    isAnimating: () => false,

    draw(frame) {
      const { ctx, width, height, progress } = frame;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = BASE;
      ctx.fillRect(0, 0, width, height);

      // The surface waking. Barely a colour — the LED field in the shader does
      // the visible half, and doubling it here blows out the top.
      const wake = easeInOut(staged(progress, 0.05, 0.22));
      if (wake > 0) {
        ctx.globalAlpha = wake * 0.5;
        ctx.fillStyle = '#0a1620';
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }

      ctx.textBaseline = 'alphabetic';
      for (const block of spec.blocks) drawBlock(frame, block);

      // Left as the renderer found it: `globalAlpha` and `fillStyle` leaking
      // between frames would make a composition depend on what drew before it.
      ctx.globalAlpha = 1;
    },

    load() {
      // Idempotent and shared: several callers get one set of fetches, and a
      // second call after they resolve is free.
      loading ??= (async () => {
        await Promise.all(
          sources.map(async (src) => {
            if (images.has(src) || failed.has(src)) return;
            try {
              images.set(src, await loadImage(src));
            } catch (error) {
              // Warned once, then left empty. A facade missing a photograph is a
              // design problem; throwing here would make it a broken frame.
              failed.add(src);
              console.warn(`[vertigo] "${spec.id}" could not load ${src}`, error);
            }
          }),
        );
      })();
      return loading;
    },

    dispose() {
      // An HTMLImageElement holds no GPU resource, but it does hold decoded
      // bytes for as long as something references it.
      images.clear();
      failed.clear();
      loading = null;
      // Zeroed rather than dropped, so its backing store goes now and not at
      // the next collection.
      if (scratchCanvas) {
        scratchCanvas.width = 1;
        scratchCanvas.height = 1;
        scratchCanvas = null;
      }
    },
  };
}
