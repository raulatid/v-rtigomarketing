import type { ComponentType } from 'react'
import type { StringInputProps } from 'sanity'

/**
 * The default string/text input with "123 / 400" underneath.
 *
 * The validation message only appears once a limit is already broken, which
 * leaves an editor cutting words after the fact. Seeing the count while typing
 * lets them write to the length instead.
 *
 * `max` is passed in rather than read from the field's validation: a rule is an
 * opaque function, and each call site already has the same `BOUNDS.x` its
 * `rule.max(...)` uses — so the two cannot disagree.
 *
 * Plain elements and Sanity's own CSS variables, not `@sanity/ui`: that package
 * is a dependency of `sanity`, not of this Studio, and importing it would be
 * relying on someone else's dependency tree.
 */
export function charCount(max: number, severity: 'error' | 'warning' = 'error'): ComponentType<StringInputProps> {
  function CharCountInput(props: StringInputProps) {
    const length = typeof props.value === 'string' ? props.value.length : 0
    const over = length > max
    return (
      <div>
        {props.renderDefault(props)}
        <div
          style={{
            marginTop: '0.4rem',
            fontSize: '0.8125rem',
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
            color: over
              ? severity === 'warning'
                ? 'var(--card-badge-caution-fg-color, #946000)'
                : 'var(--card-badge-critical-fg-color, #c4314b)'
              : 'var(--card-muted-fg-color, #6e7683)',
          }}
        >
          {length} / {max}{severity === 'warning' ? ' recomendados · puedes publicar' : ' caracteres'}
        </div>
      </div>
    )
  }
  return CharCountInput
}
