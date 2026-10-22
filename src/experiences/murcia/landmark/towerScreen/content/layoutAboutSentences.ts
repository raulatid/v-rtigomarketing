import { EDITORIAL_BOUNDS } from '../../../../../content/editorialBounds';
import { wrapSentence } from '../../../../../content/sentenceLines';
import type { FacadeBlock } from '../facadeComposition';
import type { FreeformContent } from './facadeContent';

/**
 * Conócenos' first stop on the tower's screen: five sentences written in one
 * after another, which then stay still (plan 028).
 *
 * Pure and total, like `layoutTowerSlides.ts`, and drawn by the same renderer
 * on the same wall: every number is a DESIGN metre on the 42.8 × 154.06 m
 * facade, the margin and the face are the tower list's (Text 500, at a
 * 2.7 m cap rather than 3.2), and each sentence is a `list` of its own
 * lines, uncovered by the renderer's `wipe`. The lines are `wrapSentence`'s,
 * the cut the Studio and the content build measured, so what the editor was
 * told fits is what is drawn. The last sentence takes the palette's accent;
 * the rest are ink.
 *
 * The block of lines is centred on the wall: the screen stop centres the
 * screen (`about/aboutPoses.ts`), so the words sit in the middle of the view.
 */

/** The composition's id: apart from the tower's `slide-<n>`, since the screen holds both. */
export const ABOUT_SENTENCES_ID = 'about-sentences';

/**
 * Seconds the entrance runs, from the moment the section opens. The camera's
 * flight to the screen takes 1.4 s, so the first sentence starts as it lands
 * (`FIRST`) and the last has settled about four seconds in.
 */
export const ABOUT_SENTENCES_ENTRANCE_SECONDS = 4.2;

const MARGIN = 7.5;
const FACADE_METRES_TALL = 154.06;
/**
 * Cap height: smaller than the tower list's 3.2, so that fifteen characters
 * (about 29 m at 1.95 m each) leave the right of the strip clear, where it
 * curves away from the eye. At 3.2 a full line touched that edge and was cut.
 */
const SIZE = 2.7;
/** Baseline to baseline inside a sentence. */
const LINE = 4.5;
/** Added between two sentences, so each reads as one. */
const GAP = 4.5;

/** Of the entrance's 0..1: where the first sentence starts, how far apart they start, how long each takes. */
const FIRST = 0.3;
const STEP = 0.12;
const WINDOW = 0.14;
/** A sentence's second line starts this much after its first. */
const LINE_STAGGER = 0.05;

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function layoutAboutSentences(sentences: readonly string[]): FreeformContent {
  const lines = sentences.map((sentence) => wrapSentence(sentence, EDITORIAL_BOUNDS.aboutSection.sentenceLine));
  const count = lines.reduce((sum, own) => sum + own.length, 0);
  const height = Math.max(0, count - 1) * LINE + Math.max(0, lines.length - 1) * GAP + SIZE;
  let baseline = (FACADE_METRES_TALL - height) / 2 + SIZE;

  const blocks: FacadeBlock[] = [];
  lines.forEach((own, i) => {
    if (own.length === 0) return;
    const start = FIRST + i * STEP;
    blocks.push({
      type: 'list',
      items: own,
      at: [MARGIN, round2(baseline)],
      size: SIZE,
      leading: LINE,
      stagger: LINE_STAGGER,
      reveal: 'wipe',
      tone: i === lines.length - 1 ? 'accent' : 'ink',
      stage: [round2(start), round2(start + WINDOW)],
    });
    baseline += own.length * LINE + GAP;
  });

  return { template: 'freeform', id: ABOUT_SENTENCES_ID, label: ABOUT_SENTENCES_ID, blocks };
}
