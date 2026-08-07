import { Component, ErrorInfo, ReactNode } from 'react'
import { loadProgress } from '../loading/progress'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * The one error boundary in the application, wrapping everything that touches
 * three.js.
 *
 * Without it, any throw below `<Canvas>` — a refused WebGL context on an old
 * device, a driver reset, a bad frame in a scene component — unmounts the React
 * tree and leaves the viewer looking at `index.html`'s inline `#050507`
 * background. A black screen, no message, nothing in the UI to say why.
 *
 * It renders no fallback UI of its own, and that is deliberate. The intro
 * drawing is NOT React-owned (see App.tsx, "intro-draw owns its own DOM"), so
 * it survives this unmount and is already the right place to say so: marking
 * the boot fatal puts `No se pudo cargar la experiencia` on screen, in Spanish,
 * in the same type as every other loading state. A second fallback here would
 * be a competing error UI for the same failure.
 *
 * That behaviour used to be an accident of two unrelated decisions. This makes
 * it the designed path.
 */
export class SceneErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // `chunk:scene` is the required step that means "there is a scene to warp
    // into". If the Canvas cannot mount, there is not — whatever the cause.
    loadProgress.markFatal('chunk:scene', error.message || String(error))
    console.error('[scene] fatal render error', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.failed) return null
    return this.props.children
  }
}
