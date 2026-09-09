// The Earth hint, as the one number the scene still owns.
//
// This file used to carry the particle figure's whole arithmetic — dot spacing
// against dot size, ink budgets per region, a bloom-safe grey. The figure was
// rejected 2026-09-09 and the hint is DOM text now (DECISIONS §43), so every
// size, colour and duration lives in `styles.css` under `.earth-hint`, which is
// the only thing that reads them.
//
// What is left is the one value the SCENE decides rather than the stylesheet:
// how long the viewer must be still. That is counted in the frame loop by
// `hintIdle.ts`, because it is a property of the viewer and the frame loop is
// already the thing that knows how much time has passed.

export const HINT_CONFIG = {
  presence: {
    /**
     * Stillness before the hint is offered.
     *
     * This is an IDLE affordance and not an arrival one — client direction. It
     * appears when someone has stopped doing anything and steps aside the moment
     * they move, rather than being pushed at them a beat after every arrival and
     * then never returning. Murcia's glass chip keeps the arrival rule; the two
     * are no longer wired together because they no longer answer the same
     * question.
     *
     * Long enough not to compete with someone who is still looking around, short
     * enough to read as a response to stillness rather than as a timeout.
     */
    idleSeconds: 2,
  },
} as const
