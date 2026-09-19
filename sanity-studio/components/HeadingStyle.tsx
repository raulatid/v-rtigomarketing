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
 *
 * `props.children`, never `props.renderDefault`: the style dropdown in the
 * toolbar renders this same component for its menu entry with only
 * `{ children: title }` — no `renderDefault`, no `block` — and calling it
 * there threw «renderDefault is not a function» on every legal document
 * (2026-09-19). The `block` check is what tells the two callers apart.
 */
function heading(label: string, fontSize: string) {
  return function HeadingStyle(props: BlockStyleProps) {
    const inEditor = props.block !== undefined
    const text = <div style={{ fontSize, fontWeight: 700, lineHeight: 1.25 }}>{props.children}</div>
    if (!inEditor) return text
    return (
      <div style={{ borderLeft: '3px solid var(--card-focus-ring-color, #2276fc)', paddingLeft: '0.75rem', margin: '0.5rem 0' }}>
        <div
          contentEditable={false}
          style={{ fontSize: '0.6875rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--card-muted-fg-color, #6e7683)', userSelect: 'none' }}
        >
          {label}
        </div>
        {text}
      </div>
    )
  }
}

export const TitleStyle = heading('Título de sección', '1.5rem')
export const SubtitleStyle = heading('Subtítulo', '1.2rem')
