// Which experience the application is currently showing.
//
// Both experiences stay mounted for the application's lifetime — nothing is
// created or destroyed at a transition (ADR 001, ADR 003). This value decides
// which one the render pipeline draws, and which one is allowed to consume
// input and do per-frame work.
//
// It is discrete and changes rarely, so it lives in React state rather than in
// the per-frame sequenceState object.
export type ExperienceId = 'earth' | 'murcia'
