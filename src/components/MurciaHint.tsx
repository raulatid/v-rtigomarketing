import { SceneHint } from './SceneHint'

/**
 * Murcia's way out: backward wheel, closing pinch, back to the Earth.
 *
 * Earth's hint brought to the city as it is (user direction, 2026-09-22), with
 * the gesture turned round: the return is an ascent (`adr/006`), made by
 * zooming out. Offered on stillness by `murcia/hint/MurciaHintLayer`, which
 * paints `data-visible` on `.murcia-hint`; the plate that stood here until
 * 2026-09-15 was offered on arrival instead, and this is not that.
 */
export function MurciaHint() {
  return (
    <SceneHint
      world="murcia"
      gesture="out"
      fine="Scroll para volver a la Tierra"
      coarse="Zoom para volver a la Tierra"
    />
  )
}
