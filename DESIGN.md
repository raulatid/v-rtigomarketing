---
name: Vertigo
description: Smoked glass over a living world — the night interface of the Vertigo site, and the paper its blog is read on.
colors:
  vertigo-blue: "#1c67ff"
  vertigo-blue-hover: "#3a7dff"
  vertigo-blue-pressed: "#1656d6"
  vertigo-blue-edge: "rgba(120, 160, 255, 0.35)"
  vertigo-blue-ring: "rgba(28, 103, 255, 0.22)"
  focus-ring: "rgba(120, 170, 255, 0.9)"
  void-black: "#050507"
  smoked-graphite-light: "rgba(10, 15, 22, 0.68)"
  smoked-graphite: "rgba(8, 12, 18, 0.78)"
  smoked-graphite-heavy: "rgba(7, 10, 15, 0.86)"
  glass-edge: "rgba(220, 230, 245, 0.1)"
  matte-field: "rgba(4, 7, 11, 0.55)"
  matte-field-hover: "rgba(6, 10, 15, 0.65)"
  field-edge: "rgba(220, 230, 245, 0.14)"
  field-edge-focus: "rgba(220, 230, 245, 0.32)"
  white: "#ffffff"
  text-primary: "rgba(255, 255, 255, 0.94)"
  text-quiet: "rgba(255, 255, 255, 0.85)"
  text-secondary: "rgba(255, 255, 255, 0.68)"
  text-muted: "rgba(255, 255, 255, 0.46)"
  rule-strong: "rgba(255, 255, 255, 0.35)"
  error-edge: "rgba(255, 122, 122, 0.7)"
  error-text: "rgba(255, 158, 158, 0.95)"
  ink: "#0b0b0d"
  reading-paper: "#fbfbfa"
  figure-grey: "#ececea"
typography:
  display:
    fontFamily: "'Vertigo Display', 'Vertigo Switzer', system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 2.4vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "'Vertigo Display', 'Vertigo Switzer', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Vertigo Display', 'Vertigo Switzer', system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "'Vertigo Text', 'Vertigo Inter', Georgia, serif"
    fontSize: "0.92rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Vertigo Text', 'Vertigo Inter', Georgia, serif"
    fontSize: "0.8rem"
    fontWeight: 500
    letterSpacing: "0.02em"
  eyebrow:
    fontFamily: "'Vertigo Text', 'Vertigo Inter', Georgia, serif"
    fontSize: "0.68rem"
    letterSpacing: "0.16em"
  nav-label:
    fontFamily: "'Vertigo Display', 'Vertigo Switzer', system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 600
    letterSpacing: "0.16em"
  cta:
    fontFamily: "'Vertigo Display', 'Vertigo Switzer', system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    letterSpacing: "0.01em"
  blog-title:
    fontFamily: "'Vertigo Display', 'Vertigo Blog Inter', system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  blog-prose:
    fontFamily: "'Vertigo Text', 'Vertigo Blog Serif', Georgia, serif"
    fontSize: "1.25rem"
rounded:
  hairline: "2px"
  focus: "4px"
  plate: "10px"
  card: "12px"
  tray: "14px"
  dialog: "16px"
  pill: "999px"
spacing:
  header-inset: "48px"
  header-inset-phone: "12px"
  header-control: "46px"
  header-control-phone: "44px"
  field-gap: "1.25rem"
  group-gap: "1.75rem"
  dialog-pad: "2rem"
  plaque-pad: "2.25rem"
  touch-floor: "44px"
components:
  button-primary:
    backgroundColor: "{colors.vertigo-blue}"
    textColor: "{colors.white}"
    typography: "{typography.cta}"
    rounded: "{rounded.plate}"
    height: "50px"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.vertigo-blue-hover}"
  button-primary-pressed:
    backgroundColor: "{colors.vertigo-blue-pressed}"
  nav-trigger-primary:
    backgroundColor: "{colors.vertigo-blue}"
    textColor: "{colors.white}"
    typography: "{typography.nav-label}"
    rounded: "{rounded.plate}"
    padding: "0 26px"
    height: "46px"
  nav-trigger-quiet:
    textColor: "{colors.text-quiet}"
    typography: "{typography.nav-label}"
    height: "38px"
  field:
    backgroundColor: "{colors.matte-field}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.plate}"
    padding: "0 0.9rem"
    height: "48px"
  field-hover:
    backgroundColor: "{colors.matte-field-hover}"
  panel-heavy:
    backgroundColor: "{colors.smoked-graphite-heavy}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.dialog}"
    padding: "2rem 2rem 1.6rem"
    width: "min(440px, 100%)"
  plaque:
    backgroundColor: "{colors.smoked-graphite}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
    padding: "2.25rem"
    width: "min(420px, 38vw)"
  tray:
    backgroundColor: "{colors.smoked-graphite-light}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.tray}"
    padding: "0.7rem 1.125rem 0.75rem"
  blog-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
---

# Design System: Vertigo

## Overview

**Creative North Star: "The Night Window"**

The site is a window onto a living world: deep space, a turning Earth, the city of Murcia. The
world is the content and the spectacle. The interface is a pane of smoked glass laid over it,
there to frame the one ask, never to compete with the view. It has to feel **premium** first:
the thing a large company sees and trusts with its brand. Then **cinematic**: the camera and the
panels move in a controlled, fluid, smooth way, with nothing snapping and nothing hurried. And
**confident and technical**: exact values, measured contrast, and nothing added for decoration.

Every overlay is one material, smoked graphite, at three densities. The bigger the surface, the
quieter the glass: the material should only become noticeable when set beside a plain dark
rectangle. Controls are quiet until they are needed. They sit back in the glass and come forward
under the pointer or on focus. Colour is almost absent: white type at three strengths, cool
hairline edges, and a single blue, Vertigo Blue, spent in a handful of places so that it
always means "this is the action" or "this is pressable".

The blog is the one surface that inverts. Reading is not looking, so articles sit on Reading
Paper in ink, under a black bar. It shares the display face and the blue with the scene, and
nothing else.

Confirmed rejections: frosted glass, HUD styling, neon or glow (the CTA's gradient and outer glow
were removed), and cross-fades between scenes. The picture cuts.

**Key Characteristics:**
- One smoked-graphite material in three densities; one blurred layer per panel.
- Vertigo Blue on a few named homes, and nowhere else.
- Two type roles: a display sans for headings and CTAs, a text face for everything else.
- Square-shouldered rectangles (10–16px corners). No capsule controls.
- Lines feather at both ends; nothing terminates in a cut.
- Motion enters on one long ease-out and leaves faster; reduced motion shortens rather than deletes.

## Colors

A near-black night palette of translucent graphite and white at three strengths, lit by one saturated blue.

### Primary
- **Vertigo Blue** (#1c67ff): the filled face of the primary CTA (the header's Auditoría trigger
  and the submit buttons). The same blue appears at lower strength as the edge of the floating
  trays, the ring behind a focused field, and the beacon dot on a pressable place in the world.
  Hover lifts to #3a7dff, pressed sinks to #1656d6. Its edge form (`vertigo-blue-edge`) is shared
  by the CTA's border and the trays, so there is one blue to change, not two that nearly match.
- **Focus Ring** (rgba(120, 170, 255, 0.9)): the keyboard focus outline, 2px, everywhere. It is an
  accessibility mark, not a style choice, and it is never restyled.

### Neutral
- **Void Black** (#050507): the opening black painted before anything loads, and the document's theme colour.
- **Smoked Graphite** (three densities): the body of every overlay. Light (0.68) is the floating
  tray: the hint frame, the Murcia compass plate, the consent plate. The middle density (0.78) is the
  compact plaque: the case panel. Heavy (0.86) is the heavy panel: contact, legal, the audit
  curtain. Where `backdrop-filter` is unsupported all three go near-opaque (0.92 / 0.94 / 0.96)
  and keep their order.
- **Glass Edge** (rgba(220, 230, 245, 0.1)): the cool, barely-there 1px border of the plaque and the heavy panels.
- **Matte Field** (rgba(4, 7, 11, 0.55)): inputs and selects, inset into the glass. Their border is
  `field-edge`, and they brighten to `field-edge-focus` on focus.
- **Text** (white at 0.94 / 0.68 / 0.46): primary copy, secondary copy, and muted meta and fine print.
  `text-quiet` (0.85) is the bare Contacto trigger and the header icons.
- **Rule Strong** (rgba(255, 255, 255, 0.35)): the neutral 2px tick that anchors eyebrows. It
  replaced a blue one.
- **Error** (edge rgba(255, 122, 122, 0.7), text rgba(255, 158, 158, 0.95)): field and form errors,
  always a border plus a message, never colour alone.
- **Ink** (#0b0b0d) and **Reading Paper** (#fbfbfa): the blog's inverted pair. Ink is also the
  ground of the blog's header bar. **Figure Grey** (#ececea) holds the place of an image before it loads.

### Named Rules
**The Spent-Once Rule.** Over the scene, Vertigo Blue lives in exactly these places: the filled
primary CTA, the ring behind a focused field, the keyboard focus outline, the beacon dot on a
pressable place, and the edge of the density-A trays. Accent lines, scrollbars, select chevrons,
eyebrow ticks and dividers there are all neutral. A new blue mark needs a decision, not a style.
The blog, on paper, is the exception: its links, eyebrow ticks and blockquote rule are blue.

**The Token-Only Rule.** Overlay sheets read colour from the `:root` in `siteHeader.css`, the one
sheet every document loads. No colour literal in a panel sheet, and no second `:root`.

**The Inverted Paper Rule.** The blog never consumes the glass tokens. `blog.css` reads
`--header-control` and nothing else from the site's tokens.

## Typography

**Display Font:** 'Vertigo Display', currently General Sans (falling back to Switzer, then system-ui)
**Text Font:** 'Vertigo Text', currently Gambetta, a serif (falling back to Inter, then Georgia)
**Blog prose:** 'Vertigo Text' ahead of Source Serif 4 ('Vertigo Blog Serif')

**Character:** A crisp, engineered sans carries every heading, title and call to action. A text
face carries the reading. The pairing is *under review* as of 2026-09-12: General Sans and
Gambetta replaced Switzer and Inter, and the old faces stay declared second in each stack, so going
back is a reorder. Neither new face has arrows (← → ↑ ↓), which come from the fallback.

### Hierarchy
- **Display** (600, clamp(1.75rem, 2.4vw, 2.25rem), 1.15, -0.01em): the audit panel's title, the one headline in the scene's UI.
- **Headline** (600, 1.5rem, 1.2, -0.01em): the case plaque's brand title.
- **Title** (600, 1.35rem, 1.2): dialog titles: contact and legal.
- **Body** (400, 0.92rem, 1.5): panel descriptions, held to about 44ch. The case plaque's copy runs smaller (0.85rem, 1.6).
- **Label** (500, 0.8rem, 0.02em): field labels, sentence case.
- **Eyebrow** (0.68rem, 0.16em, uppercase): micro-labels above a title, on a 2px neutral tick, in muted white.
- **Nav label** (600, 0.78rem, 0.16em, uppercase): the header triggers. They are navigation micro-labels, not sentences.
- **CTA** (600, 0.95rem, 0.01em, sentence case): the submit buttons ("Enviar", "Continuar").
- **Blog title** (600, 3rem, 1.1, -0.01em, up to 620px wide) over **Blog prose** (1.25rem) in ink on Reading Paper.

### Named Rules
**The Two Roles Rule.** Display face for headings, titles, CTAs, the compass and the LED facades.
Text face for everything else. Both are declared once, in `siteHeader.css`, under private names
(never a plain `Inter` or `Switzer`), and read through `--font-display` and `--font-text`.

**The Micro-Label Rule.** Uppercase with tracking is only for eyebrows, micro-labels and the header
triggers. Instructions, labels and submit buttons are sentence case.

**The 16px Field Rule.** Input text is never below 1rem, because iOS Safari zooms the page on
focus below that, and the scene cannot be pinched back.

## Layout

The page is a full-bleed canvas with no page scroll. Every piece of UI is an overlay fixed over
the world, on a known stack: canvas 10, intro 20, case plaque 35, warp flash 40, audit curtain 60,
dialogs 62, header 70.

- **The header line** is the one composition line: a 46px control whose centre sits 48px in from
  the top and sides. On a phone it is a 44px control anchored 12px from the top, or below the notch.
  The corner logo is drawn by the 3D canvas and *measures* this line; there is no second copy of
  the numbers.
- **The audit curtain** slides in from the left at clamp(480px, 44vw, 720px), clamp(420px, 56vw, 640px) under 1024px,
  and full width on a phone. It leaves a live strip of the scene beside it. Its form holds a
  1.75rem rhythm between groups and 1.25rem between fields.
- **The case plaque** floats right of centre (right: 20vw, min(420px, 38vw)) and becomes a bottom
  sheet under 767px. The camera's close-up framing knows about it.
- **Dialogs** centre at min(440px, 100%) with a 16px viewport gutter and a scrim.
- **Trays** sit bottom-centre (the hint frame) or hang from the header line (the Murcia compass),
  sized to clear the header's own groups.
- **The blog** is a document of its own under a black bar, with a reading column.

Width decides layout (767px and 1024px). Input capability decides behaviour: `(hover: hover)` gates
every hover, and `(pointer: coarse)` grows every close to a 44px target. There is no device detection.

## Elevation & Depth

Depth is layered glass. Each overlay is a single translucent graphite pane, blurred against the
scene (12px with 115% saturation, 10px on the smaller plaque), lit by a thin film of reflected
light across its top fifth, and separated from the world by a deep, neutral, soft shadow. Nothing
inside a pane is glass: fields and metric tiles are matte surfaces cut *into* it, with a shallow
inner shadow. Controls lift with a 1px inset top highlight and a small drop shadow, and sink when
pressed.

### Shadow Vocabulary
- **Glass** (`0 20px 60px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.035)`): trays and the plaque.
- **Glass heavy** (`0 28px 80px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.035)`): dialogs.
- **Curtain** (`24px 0 80px rgba(0,0,0,0.42)`, plus a 110px black-to-clear falloff): the audit curtain against the scene.
- **Raise** (`inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 18px rgba(0,0,0,0.28)`): the primary CTA at rest.
- **Pressed** (`inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.28)`): the CTA sitting down.
- **Inset** (`inset 0 1px 1px rgba(0,0,0,0.25)`): fields.

### Named Rules
**The Quieter-Glass Rule.** The larger the surface, the denser the graphite: tray 0.68, plaque 0.78,
heavy panel 0.86. A large form must never look like a large translucent effect.

**The One Blur Rule.** One blurred layer per panel. Fields never carry `backdrop-filter`. No stacked
blurs, no filter chains, and no animated `backdrop-filter`.

## Shapes

The shapes are architectural rectangles with softened shoulders. Controls, fields, the CTA and the
metric tiles take a 10px corner. The plaque and the consent plate take 12px, trays and the phone
sheet's top edge 14px, and dialogs 16px. Focus outlines round to 4px. The full 999px pill is
reserved for scrollbar thumbs and the blog's tag chips; a capsule-shaped control would read as a
different family beside the 10px Auditoría box. Hairlines (the success rule, the menu's emitter
line) feather to transparent at both ends.

**The Feathered Line Rule.** Nothing on this site terminates in a cut. A drawn line fades out at
12% from each end, and the curtain meets the scene through a gradient, not a hard edge.

## Components

### Buttons
Quiet until needed. There is one button on the site that looks like a button.
- **Shape:** gently squared (10px).
- **Primary:** a flat Vertigo Blue face with a 1px `vertigo-blue-edge` border and the raise shadow.
  In a panel it is 50px tall and full width, in sentence case. As the header's Auditoría trigger it
  is 46px tall with 26px of side padding, in uppercase nav-label type. It enters once, rising 8px
  over 480ms.
- **Hover / Pressed:** hover (pointer devices only) lifts to #3a7dff with a slightly deeper shadow.
  Pressed sits *down* to #1656d6 with a flatter shadow, rather than shrinking. In flight, it dims to
  0.6 and the label carries the state ("Enviando…").
- **Quiet trigger (Contacto):** bare text, no box, in nav-label type at `text-quiet`, turning white
  on hover. Over Murcia's pale daylight sky on desktop it sits on a 10px scrim
  (rgba(8, 12, 18, 0.6), 6px blur, glass edge) that reads as a shadow under the word, not as a second button.
- **Close controls:** a bare glyph that gains a faint white surface (0.08) only under the pointer.
  The audit's close is a long left-pointing arrow that nudges 4px left on hover.

### Cards / Containers
- **Tray (density A):** 14px corners, `vertigo-blue-edge` border, light graphite, glass shadow. Used
  for the hint frame (glyph over ONE uppercase word) and the Murcia compass.
- **Plaque (density B), the case panel:** 12px corners, glass edge, 2.25rem padding, an eyebrow
  on a neutral tick, the brand title in the display face, then meta at 0.45 white.
- **Metric tile:** matte (rgba(4, 7, 11, 0.45)) inset into the plaque, 10px corners, and the case's own
  brand colour as a 2px *top edge only*. That edge is the only place a client's colour touches the UI.
- **Heavy panel (density C):** dialogs at 16px corners, and the audit curtain edge to edge. The film
  rides in the background stack so it does not scroll away.

### Inputs / Fields
- **Style:** matte-field ground, 1px `field-edge` border, inset shadow, 10px corners, 48px tall,
  1rem text, 0.42 white placeholder. Selects keep the native control, with a neutral chevron drawn
  from two borders.
- **Focus:** the border does the work (`field-edge-focus`) and the blue only confirms it, as a 3px
  `vertigo-blue-ring` halo.
- **Error:** an error-edge border and an error-text message below the field. The field keeps its ring
  shape, in red.

### Navigation
- **Header:** transparent over the scene, and it takes no pointer events except on its controls,
  so the band stays draggable. The 3D mark sits at the left, the triggers at the right.
- **Phone:** the triggers fold behind a 44px, four-pixel-bar burger that turns into an ✕. Over the
  scene, the viewport itself hinges away to reveal the menu layer. On the blog, a neutral hairline
  ignites and glass wipes down beneath it.
- **Blog bar:** solid Ink with a 0.12 white hairline. Its controls inherit the ink rather than
  carrying a colour each.

### The Delivered State (signature)
When a form succeeds, it does not fade to a message. A neutral hairline ignites from the centre,
the news rises behind it in the house stagger, and the button follows. The drawing of the line
is what says something arrived.

## Do's and Don'ts

### Do:
- **Do** take every overlay colour from the `siteHeader.css` tokens, and put every surface on one of the three densities (0.68 / 0.78 / 0.86).
- **Do** keep Vertigo Blue on its homes: the primary CTA, the focused-field ring, the focus outline, the beacon dot, and the density-A tray edges.
- **Do** inset fields as matte surfaces, 48px tall with 1rem text, and confirm focus with the border first and the blue ring second.
- **Do** gate every `:hover` on `(hover: hover)`, and give every close a 44px target on `(pointer: coarse)`.
- **Do** enter on `cubic-bezier(0.22, 1, 0.36, 1)` and leave faster on `cubic-bezier(0.55, 0, 0.3, 1)`, and let pressed states sit down (darker face, flatter shadow).
- **Do** shorten motion to about 1ms under `prefers-reduced-motion`, keeping state changes and visibility flips intact.
- **Do** mark errors with a border plus a message.

### Don't:
- **Don't** make it frosted glass, a HUD, or neon: no outer glows, no gradients on the CTA, no blue emitter lines.
- **Don't** put `backdrop-filter` on a field, stack two blurred layers, or animate a blur.
- **Don't** use blue on dividers, scrollbars, chevrons, eyebrow ticks or decorative lines in the scene's UI.
- **Don't** declare a second `:root`, or put a colour literal in a panel sheet.
- **Don't** let the blog read a `--glass-*` token, or tint the scene's palette lighter to make a reading surface.
- **Don't** name a font face plain `Inter` or `Switzer`.
- **Don't** set sentences or submit buttons in uppercase.
- **Don't** shape a control as a capsule; 999px is for scrollbar thumbs and blog chips.
- **Don't** cross-fade between scenes; the picture cuts.
