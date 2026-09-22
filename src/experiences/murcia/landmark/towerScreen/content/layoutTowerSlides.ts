import type { TowerScreenContent, TowerSlide } from '../../../../../content/types';
import type { FacadeBlock, ImageBlock } from '../facadeComposition';
import type { FacadeContentDocument, FreeformContent } from './facadeContent';
import { DESIGN_METRES_WIDE } from './towerContent';

/**
 * The template: slots from the CMS onto the grid the tower's slides were
 * drawn on.
 *
 * Pure and total. A `TowerScreenContent` is a generated module the content
 * build validated (`content/collections/towerScreen.collection.ts`) and
 * `tower.test.ts` re-checked, so nothing here parses; it places. The renderer
 * and its block vocabulary are untouched — this is the one place that knows
 * both the slots and the metres.
 *
 * ## The grid, and why it is fixed
 *
 * Every number below is a DESIGN metre on the 42.8 × 154.06 m facade
 * (`towerContent.ts` explains the scale). They are the two bundled slides
 * that shipped until 2026-09-22, lifted verbatim: one 7.5 m margin that
 * clears the tapered left edge at every height; name, vocabulary and figure
 * on their baselines; the picture across the middle, feathered into the wall.
 * An editor fills the slots, never the coordinates — a slot left empty is not
 * drawn and nothing moves to close the gap, so the crossfade between two
 * slides reads as one page changing its words.
 *
 * ## The picture
 *
 * `cover` fills the whole 61.62 m slot and is feathered 6 m into the wall.
 * `contain` shows the whole upload letterboxed to the facade's width, centred
 * on the slot's centre, feathered less, and with the dust motes lit — which is
 * exactly what the bundled brand slide did, and the reason `dust` is derived
 * rather than asked: a full-bleed photograph has no air for motes to hang in.
 */

const MARGIN = 7.5;

/** Where the picture sits when it fills its slot. */
const PICTURE_SLOT = { top: 46.2, height: 61.62 } as const;
const PICTURE_CENTRE = PICTURE_SLOT.top + PICTURE_SLOT.height / 2;

const round2 = (n: number): number => Math.round(n * 100) / 100;

function picture(slide: TowerSlide): ImageBlock | null {
  const image = slide.image;
  if (image === null) return null;
  if (image.fit === 'cover') {
    return {
      type: 'image',
      src: image.src,
      at: [0, PICTURE_SLOT.top],
      size: [DESIGN_METRES_WIDE, PICTURE_SLOT.height],
      fit: 'cover',
      feather: 6,
      stage: [0.3, 0.7],
    };
  }
  // As tall as the upload is at the facade's width, capped at the slot: a
  // portrait picture is contain-fitted inside it rather than spilling into the
  // words above and below.
  const height = round2(Math.min(PICTURE_SLOT.height, (DESIGN_METRES_WIDE * image.height) / image.width));
  return {
    type: 'image',
    src: image.src,
    at: [0, round2(PICTURE_CENTRE - height / 2)],
    size: [DESIGN_METRES_WIDE, height],
    fit: 'contain',
    feather: 3,
    dust: true,
    stage: [0.3, 0.7],
  };
}

function blocksOf(slide: TowerSlide): FacadeBlock[] {
  const blocks: FacadeBlock[] = [];

  // Painted first, so every word sits on top of it.
  const image = picture(slide);
  if (image) blocks.push(image);

  blocks.push({
    type: 'headline',
    text: slide.headline.toUpperCase(),
    at: [MARGIN, 11.5],
    size: 4.2,
    tracking: 0.2,
    stage: [0.05, 0.3],
  });

  if (slide.items.length > 0) {
    blocks.push({
      type: 'list',
      items: slide.items,
      at: [MARGIN, 22.5],
      size: 3.2,
      leading: 7.5,
      stagger: 0.08,
      reveal: 'wipe',
      stage: [0.15, 0.35],
    });
  }

  if (slide.metric !== null) {
    blocks.push({
      type: 'metric',
      value: slide.metric.value,
      ...(slide.metric.prefix === undefined ? {} : { prefix: slide.metric.prefix }),
      ...(slide.metric.suffix === undefined ? {} : { suffix: slide.metric.suffix }),
      at: [MARGIN, 121],
      size: 6,
      tone: 'accent',
      countUp: true,
      stage: [0.55, 0.85],
    });
  }

  if (slide.caption1 !== null) {
    blocks.push({
      type: 'caption',
      text: slide.caption1.toUpperCase(),
      at: [MARGIN, 126],
      size: 1.8,
      tracking: 0.25,
      stage: [0.65, 0.85],
    });
  }
  if (slide.caption2 !== null) {
    blocks.push({
      type: 'caption',
      text: slide.caption2.toUpperCase(),
      at: [MARGIN, 130.5],
      size: 1.3,
      tracking: 0.1,
      tone: 'muted',
      stage: [0.72, 0.92],
    });
  }
  if (slide.caption3 !== null) {
    blocks.push({
      type: 'caption',
      text: slide.caption3.toUpperCase(),
      at: [MARGIN, 134],
      size: 1.3,
      tracking: 0.1,
      tone: 'muted',
      stage: [0.78, 0.98],
    });
  }

  return blocks;
}

/**
 * The document the screen player runs.
 *
 * One composition per slide, in the CMS's order, and a rotation only when
 * there is something to rotate to: a single slide is held, which is what the
 * player does with a document that names no rotation. No slides at all yields
 * no compositions, and `attachTowerScreen` warns and leaves the screen dark —
 * the content build refuses that document, so it is a state only a hand-edited
 * module can reach.
 */
export function layoutTowerSlides(content: TowerScreenContent): FacadeContentDocument {
  const compositions: FreeformContent[] = content.slides.map((slide) => ({
    template: 'freeform',
    id: slide.id,
    label: slide.id,
    blocks: blocksOf(slide),
  }));

  const [first, ...rest] = compositions;
  if (first === undefined || rest.length === 0) return { compositions };
  return {
    compositions,
    rotation: {
      compositions: [first.id, ...rest.map((one) => one.id)],
      seconds: content.rotationSeconds,
    },
  };
}
