/** The panel must stay below the brand plate even while the camera moves. */
export function caseSheetLayout(viewportTop: number, viewportHeight: number, logoBottom: number | null) {
  const height = Math.max(0, viewportHeight)
  // An unavailable projection is not permission to cover an unmeasured logo.
  const available = logoBottom !== null && Number.isFinite(logoBottom)
    ? Math.max(0, viewportTop + height - logoBottom - 16)
    : 0
  const maximum = Math.floor(Math.min(height * 0.85, available))
  // Keep two useful stops even when the logo allows less than the old 40dvh.
  const compact = Math.floor(Math.min(height * 0.4, maximum * 0.65))
  return { maximum, compact }
}
