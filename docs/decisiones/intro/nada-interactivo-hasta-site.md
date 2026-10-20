# Nada interactivo hasta `site`, y el consentimiento es el último trazo

**Estado:** vigente · **Desde:** 2026-08 · **Sustituye a:** la regla base de DECISIONS §26.16 y la parte de §35 sobre cuándo y dónde aparece el banner de consentimiento

## Decisión

1. **Toda la interfaz depende de `phase === 'site'`**, y los controles se desmontan en lugar de ocultarse: acciones de la cabecera, puertas, interruptor de sonido y banner de consentimiento (`src/App.tsx`).
2. **El banner de consentimiento aparece al llegar a `site`**, como el último trazo de la intro. Es una región no modal: no bloquea la navegación y Escape no lo cierra.
3. La música también arranca en `site` (ver [música](../transicion/musica.md)).

El funcionamiento del registro de consentimiento (categorías, versión, qué carga cada categoría) pertenece al área de consentimiento y legal, que aún no está migrada.

## Por qué

- Nada debe poder recibir el foco antes de que todo haya llegado.
- Montar en `site` dispara cada animación de entrada exactamente una vez.
- El consentimiento no puede ir dentro del dibujo de arranque: ese código no importa nada y nadie puede leer texto encima de un dibujo.

## Qué se descartó

Controles que llegan durante la cola de la intro, y el banner de consentimiento durante el dibujo.

## Se ha roto si…

- `e2e/consent.spec.ts` falla («asks once the intro lands, not before, and Escape does not dismiss it»).
- `e2e/boot.spec.ts` ve `.audit-trigger` antes de `site`.

## Afecta a

`src/App.tsx`, `src/components/ConsentBanner.tsx`
