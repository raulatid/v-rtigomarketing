/**
 * The blog page, drawn into a canvas the display can wear on its face.
 *
 * There are TWO routes to that canvas and the caller cannot tell them apart:
 *
 * - the **screenshot**, a photograph of the real built `/blog` taken by
 *   `scripts/blog-preview.mjs` during this build and named by a manifest, and
 * - the **plate**, a neutral page drawn from two colours.
 *
 * ## Why those two, and why nothing between them
 *
 * The lab this came from had a third option and made it the baseline: it owned the
 * blog page as strings, so it could build an SVG from the very markup `/blog`
 * injected and rasterise it, and the two diffed at zero pixels. That is not
 * available here and must not be recreated. The blog in this repository is a React
 * surface — `src/blog/BlogRoute.tsx` — and `checks/architecture.ts` forbids anything
 * under `src/experiences/` from importing it. Copying its markup and CSS into this
 * folder to get around that would put a second description of the blog in the same
 * repository as the first, which is a drift with no gate on it.
 *
 * So the screenshot is the ONLY route that carries real blog content, and it only
 * ever carries THIS BUILD's content: `scripts/blog-preview.mjs` writes it after
 * `vite build` into a `dist/` that was emptied first, so it cannot outlive the pages
 * it photographed.
 *
 * The plate is what shows when no screenshot exists — under `vite dev`, which does
 * not serve `dist/`, and on any build whose capture could not run. It is
 * DELIBERATELY not a picture of the blog: paper, a header bar, and nothing else. A
 * fallback that imitated the blog would be a copy that goes stale silently, which is
 * the exact failure the screenshot route exists to avoid; a fallback that carries no
 * content cannot be out of date because it never claimed to be current.
 *
 * ## Layout size and texture size are different numbers
 *
 * `width` and `height` are CSS pixels — the viewport the page was laid out for, and
 * what the panel's aspect is matched to. Sharpness comes from `TEXTURE_SCALE`, which
 * enlarges the destination canvas.
 */

/**
 * The most device pixels per CSS pixel the texture carries.
 *
 * A ceiling on `devicePixelRatio`, and the same one `SceneCanvas`'s `dpr={[1, 2]}`
 * puts on the renderer: the one moment the panel is sampled 1:1 is the last frame
 * before the handoff, and a texel per rendered pixel is all that frame can show.
 * Following a 3x phone past it would triple the decode cost and the VRAM for a frame
 * nobody sees for longer than it takes to leave. Below it the ratio is followed
 * down: at 1x, a 2x page is 44 MiB at 1920x1080 for detail the canvas never draws,
 * and its upload is a long frame on every approach (measured 117 ms, 2026-09-23).
 *
 * `scripts/blog-preview.mjs` captures at this ceiling, so a 1x page is the capture
 * scaled down and both routes still produce a canvas of the same dimensions.
 */
const TEXTURE_SCALE = 2;

/** Chrome's floor is 4096 and most desktop GL exposes 16384. Stay well inside. */
const MAX_TEXTURE_SIDE = 4096;

/**
 * The longest side of the texture the panel wears while it is scenery.
 *
 * The full page is sized for the last frame of an approach, and the rest of the
 * session the panel is a plate in the distance, a fraction of the frame. On a 2x
 * screen that page is 2880x1800 or more with mips, resident from the first view of
 * the city and uploaded on that view's frames. At rest it wears this instead, and
 * the full page only while a flight needs it. At 1x the full page is usually already
 * this small, and there is one canvas and no swap.
 */
const RESTING_TEXTURE_SIDE = 2048;

/** Written by the build, read here. See `scripts/blog-preview.mjs`. */
const MANIFEST_URL = '/generated/blog-preview.json';

/**
 * The blog's paper, `blog.css`'s `.blog-root` background.
 *
 * Restated here rather than imported, because importing it would mean importing
 * from `src/blog/` and `checks/architecture.ts` forbids that — and rightly: the
 * point of the plate is that it is NOT the blog. Two constants can drift, and if
 * they do the visible consequence is that a placeholder nobody sees on a healthy
 * build is slightly the wrong shade of off-white.
 */
const PLATE_PAPER = '#fbfbfa';

/** The blog header's ground, `siteHeader.css`'s `[data-layout='blog']`. */
const PLATE_BAR = '#0b0b0d';

/**
 * The bar's height in CSS pixels.
 *
 * `--header-line-top * 2 + --header-control`, which is 14 + 14 + 46 on desktop. A
 * phone resolves the same expression to 72 because its control is 44, and the two
 * are not worth distinguishing: at the size this plate is seen the difference is
 * well under a pixel until the last half-second of an approach, and at that point
 * the cover is already up.
 */
const PLATE_BAR_HEIGHT = 74;

/** Which route produced a given page image. */
export type PageSource = 'screenshot' | 'plate';

export interface PageImage {
  /** What the display's material samples during a flight: the full page. */
  readonly canvas: HTMLCanvasElement;
  /**
   * What it samples at rest: `canvas` scaled to `RESTING_TEXTURE_SIDE`, or `canvas`
   * itself when that is already small enough.
   */
  readonly restingCanvas: HTMLCanvasElement;
  /**
   * What the handoff element wears — a data URI on the plate route, the asset's own
   * URL on the screenshot route.
   *
   * Handed out rather than re-derived, and deliberately not read back off the
   * canvas: `toDataURL` would re-encode a bitmap that is already an exact rendering,
   * and the whole point of the handoff is that it is the SAME image the panel
   * showed.
   */
  readonly href: string;
  /** CSS pixels the page was laid out for. */
  readonly width: number;
  readonly height: number;
  readonly source: PageSource;
}

export interface PreviewVariant {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

/**
 * A manifest, or null for every kind of "no".
 *
 * Total, and exported so its refusals can be tested without a browser: absent,
 * unparsed, the wrong shape, an empty list, a variant with a zero dimension. Every
 * one of them falls through to the neutral plate, which is why none of them throws
 * — a page image that cannot be built is a panel that shows a blank page, and a
 * panel that shows a blank page is much better than a scene that fails to build.
 */
export function parsePreviewManifest(value: unknown): readonly PreviewVariant[] | null {
  if (typeof value !== 'object' || value === null) return null;
  const variants = (value as { variants?: unknown }).variants;
  if (!Array.isArray(variants)) return null;

  const usable = variants.filter(
    (variant): variant is PreviewVariant =>
      typeof variant === 'object' &&
      variant !== null &&
      typeof (variant as PreviewVariant).src === 'string' &&
      (variant as PreviewVariant).src !== '' &&
      Number.isFinite((variant as PreviewVariant).width) &&
      Number.isFinite((variant as PreviewVariant).height) &&
      (variant as PreviewVariant).width > 0 &&
      (variant as PreviewVariant).height > 0,
  );

  return usable.length > 0 ? usable : null;
}

export interface PageImageSourceOptions {
  /**
   * Whether this build serves `dist/`, and therefore whether a manifest can exist.
   *
   * Passed in rather than read from `import.meta.env` here, for the reason
   * `appConfig.ts` and `MurciaExperience.ts` already record: the `checks/` harnesses
   * bundle these modules for Node with esbuild, where `import.meta.env` does not
   * exist.
   *
   * It is not `DEBUG_TOOLS_ENABLED`. That flag is true under `vite preview` as well
   * as in dev, and preview serves a real `dist/` with a real manifest in it — using
   * it here would send every preview down the plate route and hide the screenshot
   * from the one environment set up to judge it.
   *
   * When false the manifest is not merely allowed to fail, it is NOT REQUESTED. The
   * assets live in `dist/`, which `vite dev` does not serve, so the fetch is
   * known-pointless — and a failed request is logged as an error by the browser
   * itself, which no amount of care on this side can suppress.
   */
  readonly buildAssetsAvailable: boolean;
}

export interface PageImageSource {
  /** The page at a layout size, by whichever route can supply it. */
  request(width: number, height: number): Promise<PageImage>;
}

/**
 * The captured variant closest in shape to the viewport being asked for.
 *
 * Compared as the LOG of the aspect ratio, so that being 1.3x too wide and 1.3x too
 * tall count as the same distance. Comparing raw ratios would make the wide end of
 * the range look further away than it is and bias every choice toward the narrowest
 * capture.
 *
 * Nearest always wins, with no tolerance gate. The captured set spans 0.46 to 1.59,
 * which brackets essentially every real viewport, so the worst any visitor sees is a
 * modestly cropped page — and a tolerance would replace that with a threshold nobody
 * can pick well, silently sending common window shapes to the plate.
 */
export function nearestVariant(
  variants: readonly PreviewVariant[],
  width: number,
  height: number,
): PreviewVariant | null {
  const wanted = Math.log(width / height);
  let best: PreviewVariant | null = null;
  let bestDistance = Infinity;

  for (const variant of variants) {
    if (!(variant.width > 0) || !(variant.height > 0) || typeof variant.src !== 'string') continue;
    const distance = Math.abs(Math.log(variant.width / variant.height) - wanted);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = variant;
    }
  }

  return best;
}

/** The device-pixel size of the canvas both routes draw into, for one viewport. */
export function textureSize(
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
): { width: number; height: number } {
  const ratio = Math.min(TEXTURE_SCALE, Math.max(1, pixelRatio));
  const scale = Math.min(ratio, MAX_TEXTURE_SIDE / Math.max(cssWidth, cssHeight));
  return { width: Math.round(cssWidth * scale), height: Math.round(cssHeight * scale) };
}

/** The resting texture's size for a full page of `width` x `height` device pixels. */
export function restingTextureSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, RESTING_TEXTURE_SIDE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * The neutral page, as an SVG string.
 *
 * Exported for its test. An SVG rather than 2D-context calls so that the canvas and
 * the handoff element are built from the SAME bytes: the element wears this as a
 * data URI, and a second description drawn with `fillRect` could disagree with it.
 */
export function platePageSvg(width: number, height: number): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const bar = Math.min(h, PLATE_BAR_HEIGHT);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect x="0" y="0" width="${w}" height="${h}" fill="${PLATE_PAPER}"/>` +
    `<rect x="0" y="0" width="${w}" height="${bar}" fill="${PLATE_BAR}"/>` +
    `</svg>`
  );
}

function newCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[blogDisplay] no 2D context for the page image');
  return { canvas, ctx };
}

function restingCanvas(page: HTMLCanvasElement): HTMLCanvasElement {
  const size = restingTextureSize(page.width, page.height);
  if (size.width === page.width && size.height === page.height) return page;
  const { canvas, ctx } = newCanvas(size.width, size.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(page, 0, 0, size.width, size.height);
  return canvas;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  // `decode()` rather than an `onload` promise. It resolves when the image is ready
  // to be DRAWN, where `load` only promises it has been parsed — drawing on load can
  // still produce an empty frame, which here would be an empty page.
  await image.decode();
  return image;
}

async function plateImage(cssWidth: number, cssHeight: number): Promise<PageImage> {
  const svg = platePageSvg(cssWidth, cssHeight);
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await loadImage(href);

  const size = textureSize(cssWidth, cssHeight, window.devicePixelRatio);
  const { canvas, ctx } = newCanvas(size.width, size.height);
  ctx.drawImage(image, 0, 0, size.width, size.height);

  return {
    canvas,
    restingCanvas: restingCanvas(canvas),
    href,
    width: cssWidth,
    height: cssHeight,
    source: 'plate',
  };
}

/**
 * A captured variant, cover-fitted into the viewport's own shape.
 *
 * Anchored TOP-LEFT rather than centred, and that is not a style choice: the handoff
 * element wears the same asset under `object-position: top left`, so a centred
 * canvas would disagree with the very element whose job is to be indistinguishable
 * from it. Top-left is also the right crop for a page — it keeps the header and the
 * headline and loses the bottom, which is what a preview of a blog should show.
 */
async function screenshotImage(
  variant: PreviewVariant,
  cssWidth: number,
  cssHeight: number,
): Promise<PageImage> {
  const image = await loadImage(variant.src);
  const size = textureSize(cssWidth, cssHeight, window.devicePixelRatio);
  const { canvas, ctx } = newCanvas(size.width, size.height);
  // Below 2x the capture is drawn DOWN, where the default filter aliases small text.
  ctx.imageSmoothingQuality = 'high';

  const scale = Math.max(size.width / image.naturalWidth, size.height / image.naturalHeight);
  ctx.drawImage(
    image,
    0,
    0,
    Math.round(image.naturalWidth * scale),
    Math.round(image.naturalHeight * scale),
  );

  return {
    canvas,
    restingCanvas: restingCanvas(canvas),
    href: variant.src,
    width: cssWidth,
    height: cssHeight,
    source: 'screenshot',
  };
}

export function createPageImageSource(options: PageImageSourceOptions): PageImageSource {
  /**
   * Fetched at most once and kept.
   *
   * A promise rather than a value, so concurrent callers — the first request and a
   * resize's request can overlap — share one fetch instead of racing to start their
   * own.
   */
  let manifestPromise: Promise<readonly PreviewVariant[] | null> | null = null;

  const manifest = async (): Promise<readonly PreviewVariant[] | null> => {
    if (!options.buildAssetsAvailable) return null;

    manifestPromise ??= (async () => {
      let response: Response;
      try {
        // `no-cache`, so the one MUTABLE name in this scheme revalidates. Every
        // asset it points at is content-hashed and immutable; a stale copy of the
        // manifest is the single way this could name a deleted file.
        response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      } catch (error) {
        console.warn('[blogDisplay] the blog preview manifest could not be fetched', error);
        return null;
      }

      // NOT A FAULT. A deploy whose capture could not run is the designed outcome of
      // `scripts/blog-preview.mjs` never failing a build, and the plate is what it
      // falls back to. Saying so at `debug` means the console can be read.
      if (response.status === 404) {
        console.debug('[blogDisplay] no blog preview for this build; using the neutral plate');
        return null;
      }
      if (!response.ok) {
        console.warn(`[blogDisplay] the blog preview manifest responded ${response.status}`);
        return null;
      }

      try {
        const variants = parsePreviewManifest(await response.json());
        if (variants === null) {
          console.warn('[blogDisplay] the blog preview manifest names no usable variants');
        }
        return variants;
      } catch (error) {
        console.warn('[blogDisplay] the blog preview manifest did not parse', error);
        return null;
      }
    })();

    return manifestPromise;
  };

  return {
    async request(width, height) {
      const cssWidth = Math.max(1, Math.round(width));
      const cssHeight = Math.max(1, Math.round(height));

      const variant = nearestVariant((await manifest()) ?? [], cssWidth, cssHeight);

      if (variant) {
        try {
          return await screenshotImage(variant, cssWidth, cssHeight);
        } catch (error) {
          // Warned, not silent: the manifest existed and named this, so something
          // the build produced is wrong. The panel is fine either way — that is the
          // point of there being two routes.
          console.warn(
            `[blogDisplay] the blog preview ${variant.src} did not load; using the neutral plate`,
            error,
          );
        }
      }

      return plateImage(cssWidth, cssHeight);
    },
  };
}
