# Movimiento reducido: una lectura por documento

**Estado:** vigente · **Desde:** 2026-09-15 (`c5f0021`) · **Sustituye a:** ARCHITECTURE §15, «Document motion policy»

## Decisión

1. **JavaScript lee `prefers-reduced-motion` una vez por documento.** El dueño es `prefersReducedMotion()` en `src/platform/motionPreference.ts`, que guarda la primera respuesta.
2. **Quién hace la primera lectura:**
   - en `/`, el arranque (`src/intro-draw/boot.ts`), que la entrega en `window.__vertigoIntro.reducedMotion` sin import entre los dos (ver [arranque sin dependencias](../intro/arranque-sin-dependencias.md)); `src/main.tsx` la recoge antes de montar React;
   - en los documentos sin intro, su entrada: `src/entries/blog.tsx` (ver [segundo documento](../blog/segundo-documento.md)) y `src/entries/not-found.tsx`.
3. **Todo lo que se monta después reutiliza ese valor:** paneles, motores de escena (`MurciaExperience` lo toma al construirse, un valor para toda la ciudad), cambios de ruta en caliente y la marca 3D diferida.
4. **Un cambio de la preferencia del sistema llega a JavaScript al recargar el documento.** Las media queries de CSS siguen vivas.
5. **Esto fija cuándo se lee la preferencia, no qué hace cada efecto con ella.** Eso es de cada área; por ejemplo, el camino `reduced` de la apertura (ver [salto y visita que vuelve](../intro/salto-y-visita-que-vuelve.md)).
6. **Solo el arranque y `motionPreference.ts` llaman a `matchMedia` con `prefers-reduced-motion`.**

## Por qué

- Una transición de cámara no puede cambiar de implementación a mitad de recorrido (comentario de `motionPreference.ts`).
- Una consulta por consumidor es cómo dos partes de la misma ciudad acaban en desacuerdo sobre el mismo ajuste (comentario de `reducedMotion` en `MurciaExperience.ts`).
- El arranque no puede importar nada, así que entrega su lectura por el contrato de `window`.

## Qué se descartó

- Que cada consumidor consulte `matchMedia` por su cuenta, como hacían antes de `c5f0021` el cursor, la cabecera, el consentimiento, la auditoría, la cola de la intro, la ciudad, la entrada de navegación y la marca del blog.
- Aplicar en JavaScript, en caliente, un cambio de la preferencia.

## Se ha roto si…

- `npm run check:architecture` falla en «motion queries belong only to boot and the document policy».
- Falla `motionPreference.test.ts` («inherits boot even when the system preference changes before app startup»).
- `e2e/motion-preference.spec.ts` falla («boot snapshot survives a preference change, late panels and the city round trip», «a cold blog and its deferred logo share a snapshot until reload»).

## Afecta a

`src/platform/motionPreference.ts`, `src/intro-draw/boot.ts`, `src/main.tsx`, `src/entries/blog.tsx`, `src/entries/not-found.tsx`, `src/experiences/murcia/MurciaExperience.ts`, `checks/architecture.ts`
