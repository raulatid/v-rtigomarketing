# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Decision-makers at large Spanish companies — the tier of PcComponentes, Vertigo's first big
client — who are evaluating a marketing agency. They arrive to judge whether Vertigo can be
trusted with a brand of their size, and success is one of two actions: requesting the audit or
getting in touch through the contact dialog.

## Product Purpose

The marketing site of Vertigo, a marketing agency based in Murcia. It exists to convert a large
company's evaluation into a conversation: it shows the work, the services and the city the agency
comes from, and every path ends one step from the audit request or the contact dialog. Leads are
reviewed manually by Vertigo ("Revisaremos tu web de forma manual").

## Positioning

Vertigo's main claim is positioning brands in the new AI search ecosystem — GEO, being found
where people now search through generative AI — with measured results to prove it. It is
prepared for the new era of search, and the proof is measurement, not promise. The site title
carries the second half already: «Marketing que se mide».

The client wants the site to say that big companies rely on Vertigo, shown through the work
itself rather than through testimonials.

## Operating Context

- A visitor lands on **Earth**: an intro that draws the isotype while the site loads, then a
  globe whose orbiting satellites carry case studies; opening one shows a case panel.
- A sustained gesture warps them to **Murcia**, a navigable 3D city: a services district, the
  Vertigo building (the client's, with an editorial banner), and a display that is the only way
  into the **blog**, which is a second HTML document (`blog.html`, `adr/013`).
- A shared site header on every surface carries the Auditoría (primary) and Contacto triggers;
  both forms, the legal panels and the cookie banner are overlays — there is no router.
- The client edits copy, cases, services, contact details, the banner and form options in
  Sanity; content is generated at build time and the browser never calls the CMS (`adr/010`,
  `adr/011`).
- Mobile is a first-class target, capability-detected rather than device-detected (DECISIONS §25).

## Capabilities and Constraints

- **Language:** all visitor-facing copy is Spanish (DECISIONS §11); `lang="es"`.
- **Audit form:** single step; «Servicio de interés» and «Rango de facturación» are selects whose
  options are CMS content and are validated server-side as a closed set; «Presupuesto mensual» is
  free text (DECISIONS §50).
- **Services:** Identidad de marca, Estrategia de contenidos, Campañas de pago, SEO, Analítica web
  (seed content). GEO is the headline claim but has no service record or copy in the content yet.
- **Terminology:** *experience* = a user-facing world (Earth, Murcia); *scene* = a `THREE.Scene`.
  Never use one for the other.
- **Undecided / pending the client:** the real contact phones (placeholders today), legally
  reviewed legal texts (placeholder boilerplate, must be written before launch), an og:image, the
  real revenue brackets (four placeholders), and the brand's real logos in the scene.

## Brand Commitments

- Name: **Vertigo**. Contact domain `vertigomkt.com`.
- The isotype (the two Bézier curves the header's 3D mark and the tower logo are built from) is
  the brand mark.
- The Vertigo building in Murcia is the client's own and carries their mark.
- Voice, as it stands in the approved copy: plain-spoken Spanish that argues against hype
  («Publicar más no es una estrategia»), specific about what gets measured.
- No third-party attribution or credit appears on the site; the brand's own © does (DECISIONS §30).

## Evidence on Hand

- **No case content in the repository is real yet.** Every case the site currently renders —
  including **PcComponentes**, the scene's chosen example satellite
  (`src/experiences/earth/orbit/orbitAssignments.ts`), and Mango, Cabify, Estrella Galicia,
  Idealista, Camper and Freixenet in `content/seed/caseStudy.json` — is a development fixture on a
  real brand. Its summary, metrics and logo lockup are placeholders: never rely on them, quote
  them, or present them as real work.
- **Real case studies and real client logos exist** and are to be supplied by the client; they
  will replace the fixtures through the CMS.
- **Testimonials exist, and the client has chosen not to use them.** Do not add testimonials,
  quotes or star ratings, real or invented.
- Absent, and not to be fabricated: GEO results or benchmarks, client counts, awards, press,
  pricing.

## Product Principles

1. **Proof is the pitch.** Big companies are persuaded by the work other big companies trusted
   Vertigo with. Show real cases; never invent one, and never borrow credibility from a fixture.
2. **Ready for AI search, shown with numbers.** The GEO claim only counts where a measured result
   stands behind it; a claim without its number is copy the client would have to retract.
3. **Every path ends one step from the ask.** The worlds, the cases and the blog exist to bring a
   decision-maker to the audit request or the contact dialog, and never to bury them.
4. **The experience demonstrates craft; it must not cost the decision.** Load time, mobile
   behaviour and legibility are part of the evaluation a large company is making.

## Accessibility & Inclusion

`prefers-reduced-motion` is honoured across the scenes and overlays; touch targets hold a 44 px
floor (projection-based in the 3D districts). No formal conformance standard has been set.
