import type { PortableTextInputProps } from 'sanity'
import { LEGAL_WORDS_ADVISED, legalReadingMinutes, legalWordCount } from '../schemas/lib/legalBody'

/**
 * The legal text editor with "1.234 palabras · unos 6 min de lectura" underneath.
 *
 * The `charCount` argument, for prose: a limit an editor only meets as a
 * refusal is a limit they cannot write to. There is no hard number here on
 * purpose (see schemas/lib/legalBody.ts) — the figure is the reference the
 * editor was missing, and the colour turns to caution at the advised length
 * rather than to an error.
 *
 * Same plain elements and Sanity CSS variables as CharCountInput, for the
 * reason given there.
 */
export function LegalBodyInput(props: PortableTextInputProps) {
  const words = legalWordCount(props.value)
  const long = words > LEGAL_WORDS_ADVISED
  return (
    <div>
      {props.renderDefault(props)}
      <div
        style={{
          marginTop: '0.4rem',
          fontSize: '0.8125rem',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          color: long ? 'var(--card-badge-caution-fg-color, #946000)' : 'var(--card-muted-fg-color, #6e7683)',
        }}
      >
        {words.toLocaleString('es-ES')} palabras · unos {legalReadingMinutes(words)} min de lectura
        {long ? ' · largo para una ventana, puedes publicar' : ''}
      </div>
    </div>
  )
}
