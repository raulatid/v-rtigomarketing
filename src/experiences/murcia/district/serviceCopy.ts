/**
 * Splits a CMS service `body` into the two lengths the projected display needs:
 * a scannable summary, and the reading copy behind "saber más".
 *
 * ## Why this exists rather than a second CMS field
 *
 * `Service` is `{ id, title, body }` and is shared with everything else that
 * renders a service. Adding a `summary` field would mean a Sanity schema change,
 * a Studio deploy and an editing pass before the district could render at all,
 * to express something the copy already contains: its opening line is the hook.
 *
 * ## What the copy actually looks like
 *
 * The lab authored an explicit two-field summary/detail pair. Published copy is
 * not shaped that way. Measured 2026-08-31 against all five services:
 *
 *   every body is ONE paragraph, 265–355 characters, 2–3 sentences
 *
 * So a paragraph split — the obvious reading of the `Service.body` contract,
 * which says "one or two short paragraphs, separated by a blank line" — returns
 * the whole body as the summary and makes "saber más" reveal nothing. The
 * paragraph rule is still honoured when an editor writes two, because that is an
 * explicit authorial choice; it just cannot be the only rule.
 *
 * Falling back to leading sentences gives 34–102 character summaries against
 * 265–355 character details: a real difference in both directions, and each one
 * reads as a standalone hook because that is how the copy was written.
 *
 * ## The degenerate case
 *
 * A one-sentence body yields `summary === detail`, and "saber más" then opens a
 * panel showing what was already on screen. No published service is like this
 * and nothing here prevents it — it is a copy problem, visible to the editor who
 * wrote it, and inventing a control that appears and disappears with the length
 * of a paragraph would hide it rather than fix it.
 */

/**
 * The longest summary the display's fixed summary area was designed to hold.
 *
 * Sentences are accumulated while they fit under this; the first is always taken
 * whatever its length, because a summary that could be empty is worse than one
 * that is slightly long. Measured against published copy this admits exactly the
 * first sentence of every service, which is the intended result — the bound is
 * what keeps that true if someone writes four short ones.
 */
const SUMMARY_MAX_CHARS = 150;

/**
 * Ends a sentence only when the next one visibly starts.
 *
 * The lookahead is the whole guard: `.` also appears in "3.5" and in
 * abbreviations, and a bare `/(?<=[.!?])\s+/` splits both. Requiring an opening
 * mark, a quote or a capital after the space costs nothing on ordinary prose and
 * removes the class of mis-splits entirely.
 */
const SENTENCE_BREAK = /(?<=[.!?…])\s+(?=[¿¡"«'(‘“A-ZÁÉÍÓÚÜÑ0-9])/u;

export interface ServiceCopy {
  /** One or two sentences. What the display shows at rest. */
  summary: string;
  /** The whole body, always. What "saber más" opens. */
  detail: string;
}

export function splitServiceCopy(body: string): ServiceCopy {
  const detail = body.replace(/\r\n/g, '\n').trim();
  if (detail === '') return { summary: '', detail: '' };

  const paragraphs = detail.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== '');

  // Two paragraphs is the author saying where the break is. Take it as written,
  // uncapped: overriding an explicit choice because it ran long would be worse
  // than a summary that needs editing, and it is visible either way.
  if (paragraphs.length >= 2) {
    return { summary: paragraphs[0], detail };
  }

  const sentences = (paragraphs[0] ?? detail).split(SENTENCE_BREAK);
  let summary = sentences[0] ?? detail;
  for (let i = 1; i < sentences.length; i += 1) {
    const next = `${summary} ${sentences[i]}`;
    if (next.length > SUMMARY_MAX_CHARS) break;
    summary = next;
  }

  return { summary, detail };
}
