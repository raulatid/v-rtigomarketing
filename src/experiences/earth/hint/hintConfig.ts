// The Earth hint, as the two numbers the scene still owns.
//
// This file used to carry the particle figure's whole arithmetic — dot spacing
// against dot size, ink budgets per region, a bloom-safe grey. The figure was
// rejected 2026-09-09 and the hint is DOM text now (DECISIONS §43), so every
// size, colour and duration lives in `styles.css` under `.scene-hint`, which is
// the only thing that reads them.
//
// What is left are the two values the SCENE decides rather than the stylesheet:
// how long the viewer must be still for the hint to come back, and how long it
// stands while they are busy. Both are counted in the frame loop by
// `hintIdle.ts`, because they are properties of the viewer and the frame loop
// is already the thing that knows how much time has passed.

export const HINT_CONFIG = {
  presence: {
    /**
     * Stillness before the hint comes BACK.
     *
     * It no longer gates the first appearance: since 2026-09-23 the sentence
     * stands on arrival and `graceSeconds` is what takes it away (client
     * direction). This is the return trip only — a viewer who worked the scene
     * long enough to lose the hint gets it back after this much quiet.
     *
     * Long enough not to compete with someone who is still looking around, short
     * enough to read as a response to stillness rather than as a timeout.
     */
    idleSeconds: 2,

    /**
     * How long the hint stands into a burst of activity before stepping aside.
     *
     * Client direction, 2026-09-23: the sentence used to vanish on the first
     * press or scroll, which took it away at exactly the moment the viewer was
     * trying the gesture it describes. Five seconds is long enough to finish
     * reading it while already moving, short enough that someone who has plainly
     * got the idea is not still being told.
     *
     * Murcia's hint shares both numbers (`SceneCanvas` hands them to
     * `MurciaHintLayer`), so the two worlds behave the same.
     */
    graceSeconds: 5,
  },
} as const
