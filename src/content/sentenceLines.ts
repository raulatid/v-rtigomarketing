/**
 * Where a sentence on the tower's screen breaks into lines.
 *
 * A leaf, like `editorialBounds.ts`, and for the same three readers: the
 * Studio, which refuses a sentence that does not fit; the content build
 * (`invariants.ts`), which refuses it again; and the screen's layout
 * (`layoutAboutSentences.ts`), which draws exactly these lines. One function,
 * so a sentence the editor was told fits is the one the wall shows. No
 * imports: the Studio compiles it on its own.
 */

/**
 * The lines `sentence` breaks into at `maxPerLine` characters, cut at spaces,
 * filled greedily. Runs of whitespace count as one space; a word longer than a
 * line keeps a line of its own, still too long, for the caller to refuse.
 */
export function wrapSentence(sentence: string, maxPerLine: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of sentence.trim().split(/\s+/)) {
    if (word === '') continue
    if (line === '') line = word
    else if (line.length + 1 + word.length <= maxPerLine) line += ' ' + word
    else {
      lines.push(line)
      line = word
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

/** Whether `sentence` fits in `maxLines` lines of `maxPerLine` characters. */
export function sentenceFits(sentence: string, maxPerLine: number, maxLines: number): boolean {
  const lines = wrapSentence(sentence, maxPerLine)
  return lines.length > 0 && lines.length <= maxLines && lines.every((line) => line.length <= maxPerLine)
}
