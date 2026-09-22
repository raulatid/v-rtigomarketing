/** Read-only views passed by application orchestration into scene adapters. */
export interface NavigationSignals {
  // Transition flash, composed with the intro overlays using max().
  // Owned by the transition controller, not the intro timeline, and the only
  // one that can still be non-zero after the intro has landed.
  transitionOverlay: number
  // 0..1 across the Earth<->Murcia warp, the exact counterpart of warpProgress.
  // Read by both experiences' camera drivers and by RenderPipeline.
  //
  // Progress is published by the cinematic clock. Ask transitionCommitted for
  // camera ownership: it is set before the first progress update.
  transitionProgress: number
  // Whether the non-zero progress above belongs to a COMMITTED cinematic.
  //
  // The distinction is camera ownership, and it is the difference between two
  // behaviours that were conflated until a scrubbed gesture froze Earth's orbit
  // for the length of its decay: a cinematic OWNS the camera and every other
  // writer stands down for its duration; a gesture MODIFIES whatever pose the
  // viewer is currently dragging, and must never take the controls away.
  transitionCommitted: boolean
  // 0..1 across Earth's swing above the destination, null when none is running.
  //
  // The phase between a commit toward Murcia and the cinematic: the viewer has
  // already left, input is already locked, but `transitionCommitted` is still
  // false because the camera has NOT changed hands — Earth's own rig turns it,
  // so the orbit the dolly then departs from is one the rig actually holds.
  // Linear; the reader owns the easing.
  departureAim: number | null
  // Where the viewer has zoomed the world they are in, -1..+1 (`adr/014`).
  //
  // -1 is furthest from the transition, +1 is against the limit that leads to
  // the other world — INWARD on Earth, outward and higher in Murcia, because the
  // band's positive direction always faces the other world and each experience
  // maps it through its own `camera/zoomPose`.
  //
  // Here for the same reason `transitionProgress` is, and it is the reason this
  // object exists: a wheel produces well over a hundred events a second and a
  // React state mirror would be a render of two canvases and all the overlay
  // chrome per event.
  //
  // PERSISTENT, unlike everything else on this object. Nothing decays it, no
  // timeline pins it, and it survives a tab hide — a viewer coming back to the
  // tab has not asked for their camera to move. The one thing that clears it is
  // the warp's cut, where the world under it is replaced anyway.
  zoomDepth: number
}

export type NavigationView = Readonly<NavigationSignals>
