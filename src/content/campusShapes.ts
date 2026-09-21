/**
 * The shapes a service can take in the campus, named once.
 *
 * THE PROBLEM THIS SOLVES is the one `editorialBounds.ts` solves for numbers,
 * and it arrived the same way. Which symbol a service forms, and which figure
 * that symbol turns into, used to be a developer's decision in a table
 * (`src/experiences/murcia/scene/cityDistrictBindings.ts`) keyed by the
 * service's slug. Publishing a service the table did not list rejected the
 * WHOLE campus document, which took the section down to scenery and the build
 * down with it — so an editorial act needed a code change, and the one time it
 * did not get one it failed loudly for the wrong reason and silently for the
 * right one.
 *
 * The choice belongs to whoever writes the copy, because a figure draws the
 * mechanism the copy argues. So it is a Studio field now, and a Studio field
 * with a closed list needs that list in three places at once:
 *
 *   - `sanity-studio/schemas/service.ts`, to offer the options;
 *   - `content/collections/districts.collection.ts`, to refuse anything that
 *     reached the CMS by another route;
 *   - `src/experiences/murcia/campus/`, to draw them.
 *
 * Written three times they drift, and the drift is silent: an option the editor
 * can pick and the campus cannot draw looks like a choice that did nothing.
 *
 * ── WHY THIS FILE HAS NO IMPORTS, AND MUST NOT GAIN ANY ──
 *
 * The same reason `editorialBounds.ts` has none, and the reason it is a sibling
 * of that file rather than a section inside it. Two boundaries meet here and
 * both are enforced:
 *
 *   - the Sanity Studio is its own package, and an import reaching out of it is
 *     only safe while what it reaches is a leaf — no types, no helpers, nothing
 *     that could pull React, three or a DOM global into `sanity build`;
 *   - `checks/architecture.ts` §1b forbids `content/` (the Node-side pipeline)
 *     from importing `src/experiences/` at all, and allows exactly one crossing:
 *     `content/` -> `src/content/`. That is why this table cannot live beside
 *     the code that draws it, which is the otherwise obvious home.
 *
 * A sibling rather than a field of `EDITORIAL_BOUNDS` because that table's own
 * rule is "a NUMBER with two or more consumers", and stretching it to hold a
 * vocabulary would make the next person guess what else fits.
 *
 * ── WHAT IS NOT HERE ──
 *
 * The artwork and the geometry. `campus/content/campusIcons.ts` holds the SVG
 * each symbol draws and `campus/particles/figureLayouts.ts` holds what each
 * figure builds; this file only says which names exist. A test on each side
 * asserts it implements every name, which is what keeps a name from being
 * offered to an editor before anything can draw it.
 */

/**
 * The symbols a service's particles can form at rest.
 *
 * Placeholders until the real artwork arrives — four generic marks for five
 * services, so one repeats. That is why a symbol has a DEFAULT and a figure
 * does not: a symbol claims nothing about the service, and the particles at a
 * stop have to form something.
 */
export const CAMPUS_SYMBOLS = ['magnifier', 'window', 'pin', 'mark'] as const;
export type CampusSymbol = (typeof CAMPUS_SYMBOLS)[number];

/** What a service forms when nobody has chosen. See above for why one exists. */
export const DEFAULT_CAMPUS_SYMBOL: CampusSymbol = 'mark';

/**
 * The figures a symbol can turn into.
 *
 * Each draws the one mechanism its service's copy states — see
 * `figureLayouts.ts` — so a figure belongs to a service, not to a style, and
 * there is deliberately NO default. A figure nobody chose would assert a
 * mechanism nobody wrote; a service without one keeps its symbol and turns into
 * nothing, which is a hole rather than a lie.
 */
export const CAMPUS_FIGURES = ['compound', 'segments', 'funnel', 'path', 'repeat'] as const;
export type CampusFigure = (typeof CAMPUS_FIGURES)[number];

export const isCampusSymbol = (value: unknown): value is CampusSymbol =>
  typeof value === 'string' && (CAMPUS_SYMBOLS as readonly string[]).includes(value);

export const isCampusFigure = (value: unknown): value is CampusFigure =>
  typeof value === 'string' && (CAMPUS_FIGURES as readonly string[]).includes(value);
