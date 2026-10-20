# Las marcas que sube un editor se validan en dos niveles, y otra vez en el build

**Estado:** vigente · **Desde:** 2026-09; ajustes hasta 2026-10-16 · **Sustituye a:** DECISIONS §26.23

## Decisión

1. **Los números se comparten** en `EDITORIAL_BOUNDS.caseStudy` (`src/content/editorialBounds.ts`): `brandMarkBox` (derivado de las celdas del atlas), `brandMarkMinDrawn` y `brandMarkBytes`.
2. **Studio bloquea:**
   - formatos que no sean PNG ni WebP, con mensajes propios para JPG y SVG;
   - un isotipo que se dibujaría por debajo de `brandMarkMinDrawn`;
   - un logo con proporción fuera de rango.
3. **Studio aconseja, sin bloquear** (`brandMarkAdvice`): proporción ideal, imagen ampliada, por debajo del tamaño ideal, ancho desperdiciado.
4. **El peso se comprueba con un validador asíncrono** (`brandMarkWeight`). La lectura de la referencia de imagen falla en abierto: si Sanity cambia su formato de id, nunca se rechaza un arte correcto. `brandMarksTogether` exige el par.
5. **El build vuelve a comprobar** (`BRAND_MARK_RULES` en `content/collections/caseStudies.collection.ts`):
   - solo la proporción, sin contar píxeles;
   - un tope de peso;
   - rechazo de SVG;
   - descarga del arte a como mucho 1,5 veces la caja.
6. **[`docs/earth/logo-spec.md`](../../earth/logo-spec.md) es el contrato con el cliente** que siguen las dos copias de las reglas.

## Por qué

El renderizador ajusta en *contain*, así que un archivo equivocado se ve mal sin dar error. El build cubre lo que entra por importaciones y por la API HTTP, no solo por Studio.

## Qué se descartó

Reglas solo en prosa, tolerar JPEG, una banda de proporción para el isotipo y un mínimo de píxeles en el build.

## Se ha roto si…

- Fallan `content/lib/mirror.test.ts`, `content/collections/collections.test.ts` («gives each brand mark a format and geometry rule», «downloads each brand mark at most 1.5x…») o `createBrandAtlas.test.ts` («is the box the Studio and the content build judge artwork against»).
- Fallan los tests de Studio (`npm --prefix sanity-studio test`, `editorial.test.ts`). **`npm run check` no los ejecuta.**

## Afecta a

`src/content/editorialBounds.ts`, `sanity-studio/schemas/lib/brandMark.ts`, `sanity-studio/schemas/lib/brandMarkWeight.ts`, `content/collections/caseStudies.collection.ts`, `content/lib/mirror.ts`, `docs/earth/logo-spec.md`
