// Real Vertigo isotype geometry in SVG viewBox coordinates (0 0 400 400).
//
// The two paths were traced from the brand mark with potrace and scaled into
// the viewBox by two one-off scripts. Both scripts were DELETED on 2026-08-25
// along with the `potrace` devDependency: their inputs (`docs/isotipo-mask.png`,
// `docs/isotipo-traced.svg`) had already been removed, so neither could run, and
// potrace was the sole cause of five of the seven advisories `npm audit`
// reported. The original mark lives outside the repo at `03_UX-UI/isotipo.png`;
// re-tracing means installing potrace with `--no-save` for the afternoon, not
// restoring a dependency. The paths below ARE the output and are the source of
// truth for the drawn mark.

// Lives inside intro-draw because the mark is drawn in P0 and nowhere else on
// the site — the corner logo uses the GLB, not these paths. The module that
// draws it owns it, which is also what keeps the module standalone.
//
// Coordinate space the paths were built for — must match the viewBox attribute.
// This is not the rendered size: the on-screen size is the --intro-base vmin
// count, scaled by --intro-scale (see introDraw.ts).
export const VIEWBOX = { width: 400, height: 400 }
export const CENTER = { x: VIEWBOX.width / 2, y: VIEWBOX.height / 2 }

// Upper curved arc band of the isotype. Starts at the top-left tip.
export const ARC_D =
  'M 33.73 13.62 C 26.17 21.10 17.20 29.96 13.81 33.31 L 7.66 39.40 12.39 42.84 C 104.69 109.97 205.45 125.61 305.10 88.27 C 335.24 76.98 368.88 58.20 390.04 40.87 C 391.24 39.88 392.32 39.11 392.43 39.17 C 392.54 39.23 390.87 37.49 388.71 35.31 C 386.56 33.12 378.73 25.18 371.33 17.67 C 363.93 10.15 357.02 3.14 355.99 2.09 L 354.11 0.18 350.73 2.50 C 312.78 28.54 272.61 44.73 232.31 50.23 C 213.24 52.83 192.89 53.08 173.81 50.94 C 147.43 47.98 121.54 40.74 96.35 29.27 C 79.29 21.50 62.16 11.38 49.93 1.84 C 48.63 0.83 47.55 0.00 47.53 0.01 C 47.51 0.02 41.30 6.14 33.73 13.62 Z'

// V shape below the arc. Starts at the outer top-left tip.
export const V_D =
  'M 34.52 99.72 C 34.70 100.21 168.54 399.37 168.61 399.46 C 168.67 399.53 231.02 400.00 231.10 399.93 C 231.23 399.82 365.04 99.74 364.99 99.68 C 364.95 99.65 362.25 100.95 358.98 102.59 C 338.55 112.81 313.27 122.87 293.56 128.63 C 292.29 129.00 291.17 129.39 291.05 129.50 C 290.94 129.61 270.50 175.07 245.63 230.54 C 220.75 286.00 200.31 331.56 200.20 331.78 C 200.02 332.12 194.69 320.32 154.55 230.72 L 109.10 129.28 107.41 128.98 C 93.82 126.59 64.20 114.76 38.01 101.26 C 35.48 99.96 34.43 99.49 34.52 99.72 Z'

// Combined silhouette for the final solid fill.
export const FILL_D = `${ARC_D} ${V_D}`

// First drawing vertex of the V — the dot travels here from the center.
export const FIRST_VERTEX: readonly [number, number] = [34.52, 99.72]

// Start of the arc band path — the dot hops here after finishing the V.
export const ARC_START: readonly [number, number] = [33.73, 13.62]

// Salient tips/corners used to anchor the isometric depth edges.
export const DEPTH_VERTICES: ReadonlyArray<readonly [number, number]> = [
  [7.66, 39.4], // arc left tip
  [47.53, 0.01], // arc top-left corner
  [354.11, 0.18], // arc top-right corner
  [392.43, 39.17], // arc right tip
  [34.52, 99.72], // V left tip
  [364.99, 99.68], // V right tip
  [200.2, 331.78], // V inner apex
  [168.61, 399.46], // V bottom-left corner
  [231.1, 399.93], // V bottom-right corner
]
