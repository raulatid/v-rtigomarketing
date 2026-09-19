import { collapseWhitespace, stripHtml } from '../../../content/lib/html'

/**
 * The advisory tier for plain text: things the build accepts and the site then
 * shows differently from how the editor saw them. Every one of these publishes;
 * the field shows a yellow note saying what will happen.
 *
 * They exist because "accepted by the build" and "looks on the site the way it
 * looked in the Studio" are different promises, and the 2026-09-19 audit found
 * the gap between them in four places.
 */

/** Text the build will strip — a pasted tag, an unclosed one — before publishing. */
export function markupAdvice(value: unknown): true | string {
  if (typeof value !== 'string' || value.length === 0) return true
  const clean = stripHtml(value)
  if (clean === collapseWhitespace(value)) return true
  return 'Parte del texto parece código HTML y no se publicará. Quedará así: «' + clean + '».'
}

/** A multi-line field whose site rendering is one run of text. */
export function singleParagraphAdvice(value: unknown): true | string {
  if (typeof value !== 'string' || !/\n/.test(value.trim())) return true
  return 'Los saltos de línea no se muestran en la web: este texto se publica como un solo párrafo.'
}

/**
 * The service description's opening, as the campus plate shows it: the first
 * paragraph, every line of it, under the service title (`campusContent.ts`).
 * The description promises "two short lines"; this is what says so when the
 * text stops being that.
 */
export const SERVICE_OPENING_LINES = 2
export const SERVICE_OPENING_LINE_CHARS = 40

export function serviceOpeningAdvice(value: unknown): true | string {
  if (typeof value !== 'string') return true
  const opening = value.trim().split(/\n\s*\n/)[0] ?? ''
  const lines = opening.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
  if (lines.length <= 1) return true
  if (lines.length > SERVICE_OPENING_LINES) {
    return (
      'El primer párrafo tiene ' + lines.length + ' líneas y en el campus se muestran todas bajo el título. ' +
      'Deja ' + SERVICE_OPENING_LINES + ' líneas cortas y pasa el resto a un segundo párrafo.'
    )
  }
  const longest = Math.max(...lines.map((line) => line.length))
  if (longest > SERVICE_OPENING_LINE_CHARS) {
    return (
      'Una línea del primer párrafo tiene ' + longest + ' caracteres; en el campus, por encima de ' +
      SERVICE_OPENING_LINE_CHARS + ' se parte en dos. Acórtala si puedes.'
    )
  }
  return true
}

/**
 * A colour that is valid and invisible. The panels, the satellite ring and the
 * campus particles all sit on near-black glass; a brand whose colour is
 * near-black draws nothing anyone can see. Relative luminance per WCAG, on the
 * sRGB value the field holds.
 */
const NEAR_BLACK_LUMINANCE = 0.03

export function darkColorAdvice(value: unknown): true | string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) return true
  const channel = (hex: string) => {
    const c = parseInt(hex, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(value.slice(1, 3)) + 0.7152 * channel(value.slice(3, 5)) + 0.0722 * channel(value.slice(5, 7))
  if (luminance >= NEAR_BLACK_LUMINANCE) return true
  return 'Este color es casi negro y la web lo dibuja sobre fondo oscuro: apenas se verá. Elige un tono más claro de la marca, o deja el campo vacío.'
}
