# El azul se gasta en pocos sitios

**Estado:** vigente · **Desde:** 2026-09-06 (`24f03ce`; borde azul de las bandejas el mismo día, `16084ae`, por indicación del cliente); el burger volvió a blanco el 2026-09-09 (`f576ed8`); el anillo del campo pasó a ser una línea el 2026-10-14 (`411de44`); los puntos de interés de Murcia desde el 2026-10-21 (`5201df9`) · **Sustituye a:** DECISIONS §37 («Blue is scarce…» y su enmienda); la fila «Blue marks accents, focus, scrollbars…» de «Superseded»

## Decisión

1. **Un solo azul** (`--accent`, con `--accent-hover`, `--accent-pressed` y `--accent-border`, en `siteHeader.css`), y sobre la escena solo en estos sitios:
   - la cara del CTA principal (el disparador Auditoría, los botones de envío y «Ver sus casos» en la placa de [Conócenos](../murcia/seccion-conocenos.md));
   - la línea de un campo con foco y el trazo junto a su etiqueta (`--field-line-active`);
   - el borde de las bandejas de densidad A (`--glass-border-accent`, alias de `--accent-border`, para que sean el mismo azul);
   - el contorno de foco del teclado (`--focus-ring`);
   - en Murcia, lo que responde a un clic: los [puntos de interés](../murcia/edificios-interactivos.md) (`.murcia-poi__dot` y su anillo, en `murcia.css`) y el tinte de hover de los lugares (`BUILDING_HIGHLIGHT`, repetido a mano en el shader). Ahí el azul significa «aquí se puede ir», lo mismo que en el CTA.
2. **Todo lo demás es neutro:** separadores, barras de scroll, chevrones, marcas de antetítulo y líneas decorativas.
3. **Un azul nuevo es una decisión, no un estilo.** Las hojas de panel no escriben literales de color: leen tokens.
4. **El blog, sobre papel, es la excepción:** sus enlaces, marcas y filete de cita son azules.

## Por qué

El azul estaba en acentos, botones, barras de scroll, flechas, focos, marcas, guías, puntos y seis copias de la línea emisora; ya no significaba «esta es la acción». El borde azul de las bandejas lo pidió el cliente al ver el neutro sobre la escena.

## Qué se descartó

- El degradado de 110° y el brillo exterior del CTA.
- El burger azul (una hora, el 2026-09-09).
- El punto azul de las balizas (retiradas el 2026-09-10, `be65215`). Para lo que se puede tocar en Murcia lo sustituyen los puntos de interés (2026-10-21): sin marca visible, los visitantes seguían sin saber qué edificios eran clicables.

## Qué queda abierto

Pendiente de decidir; mientras tanto, la lista de arriba no se amplía ni la regla se relaja. El código usa hoy azul fuera de la lista:
- el anillo del [cursor propio](cursor-propio.md) (`.cursor-follow-core` en `styles.css`, con literales);
- los interruptores de `cookiePreferences.css`;
- la casilla del diálogo de reclamo (`claimDialog.css`, `accent-color`);
- el hover de Contacto, Blog y Servicios sobre tono claro (`siteHeader.css`);
- el hover del enlace de la página 404, sobre fondo oscuro y con literal (`.not-found__link:hover` en `src/notFound/notFound.css`);
- el degradado de la línea de progreso del botón de envío (`auditSection.css`, `contactSection.css`, con literales).

También hay literales de color en hojas de panel (`consentBanner.css`, `auditSection.css`, `styles.css` y el velo de Contacto en `siteHeader.css`), que no reaccionan al bloque `@supports` sin desenfoque.

## Se ha roto si…

- Aparece `var(--accent…)` o `#1c67ff` en una hoja de la escena fuera de los sitios listados y de los pendientes (búsqueda; sin test).
- El borde de una bandeja y el del CTA dejan de ser el mismo token.

## Afecta a

`src/components/siteHeader.css`, `src/components/auditSection.css`, `src/components/contactSection.css`, `src/components/consentBanner.css`, `src/components/cookiePreferences.css`, `src/components/claimDialog.css`, `src/experiences/murcia/styles/murcia.css`, `src/styles.css`, `src/blog/blog.css`, `src/notFound/notFound.css`
