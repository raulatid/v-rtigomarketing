/**
 * Resolves once the next frame has been drawn, so the work after it starts a
 * task of its own instead of lengthening the one before.
 *
 * The city is built while Earth is on screen, right after the h1 lands (ADR
 * 016, `HeadlineFlightLayer`): its steps used to run back to back in four
 * tasks of up to ~0.45 s on a desktop, every frame of which was lost
 * (2026-11-25). Awaited between steps, it hands the frame back in between.
 *
 * After the frame, not in it: a `requestAnimationFrame` callback runs before
 * the frame is drawn, so work resumed there would delay that frame. A hidden
 * tab draws no frames, so the timeout keeps the build going there.
 */
export function afterNextFrame(hiddenTimeoutMs = 100): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, hiddenTimeoutMs);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(finish, 0));
  });
}
