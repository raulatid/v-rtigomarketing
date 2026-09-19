import type { BlockStyleProps } from 'sanity'

/**
 * How a «Título» / «Subtítulo» block looks while being edited.
 *
 * Sanity's default already sets headings larger, but a bold paragraph and a
 * heading sit close enough in the editor that the legal texts were rewritten
 * with the former standing in for the latter (2026-09-18). A rule down the
 * left and a small label make the difference a thing you see, not a thing you
 * infer from font size. The label is `contentEditable={false}` as the Sanity
 * docs require: text the editor cannot select must not look like text it can.
 */
function heading(label: string) {
  return function HeadingStyle(props: BlockStyleProps) {
    return (
      <div style={{ borderLeft: '3px solid var(--card-focus-ring-color, #2276fc)', paddingLeft: '0.75rem', margin: '0.5rem 0' }}>
        <div
          contentEditable={false}
          style={{ fontSize: '0.6875rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--card-muted-fg-color, #6e7683)', userSelect: 'none' }}
        >
          {label}
        </div>
        {props.renderDefault(props)}
      </div>
    )
  }
}

export const TitleStyle = heading('Título de sección')
export const SubtitleStyle = heading('Subtítulo')
