import type { CSSProperties, ReactNode, Ref } from 'react'
import { MENU_MOTION_MS } from '../corner-logo/headerMenuTiming'
import './siteMenu.css'

/** The same background and moving viewport on every site surface. */
export function SiteMenuLayer({ hostRef, className = '' }: {
  hostRef: Ref<HTMLDivElement>
  className?: string
}) {
  return <div className={'site-menu-layer ' + className} ref={hostRef} />
}

export function SiteMenuStage({ children, className = '', viewportClassName = '', style, inert }: {
  children: ReactNode
  className?: string
  viewportClassName?: string
  inert?: boolean
  style?: CSSProperties
}) {
  return (
    <div className={'site-menu-stage ' + className} style={{ '--menu-3d-ms': MENU_MOTION_MS + 'ms', ...style } as CSSProperties}>
      <div className={'site-menu-viewport ' + viewportClassName} inert={inert}>{children}</div>
    </div>
  )
}
