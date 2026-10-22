# Saltar la cola, la visita que vuelve, el movimiento reducido y la depuración

**Estado:** vigente · **Desde:** 2026-09-17 · **Sustituye a:** DECISIONS §26.18 y §51 (con su enmienda)

## Decisión

### Saltar la cola de la intro
1. **Una pulsación salta solo durante la cola** (`TAIL_PHASES` en `src/app/introSkip.ts`): botón principal, toque o lápiz. Se ignora en el blog y en Murcia.
2. **Escape salta a `site`** desde la cola, salvo con paneles, el menú, el blog o Murcia abiertos. **Durante el dibujo no hace nada**, porque la cola todavía no existe: el dibujo no se puede saltar.

### Visita que vuelve
3. **Se decide en el arranque** (`isReturningVisitor`): hace falta un registro de consentimiento válido con `preferences` aceptado y el registro `vertigo:intro`.
4. **El dibujo espera en silencio** (`quiet`): sin marca y sin duración mínima, hasta `ready`. Solo se muestra si la espera supera `DRAW_TIMING.quietGrace` o si hay un fatal.
5. **La cola sigue el camino `returning`**, sin warp. El cambio a la Tierra es un único tick bajo una cubierta que se desvanece (`returnRevealDuration`). Un replay reproduce la cola completa: el evento `replay` cambia el camino a `first`.
6. **`vertigo:intro` solo se escribe con `preferences` aceptado**, y se borra si se retira el consentimiento, también entre pestañas.

### Movimiento reducido
7. **Se lee una vez por documento.** El dibujo muestra el contorno completo y la disponibilidad trae el relleno, manteniendo la duración mínima. Camino `reduced`: del dibujo directamente a `site`, sin warp ni cruce, y el logo aparece ya aparcado en la esquina (`snapToCorner`), sin giro ni vuelo. Su giro lento en la esquina se mantiene, como las órbitas.

### Depuración
8. **`/debug` solo existe fuera de producción**, sin persistencia, con botones de seek, salto y replay (`DebugOverlay.tsx`).

## Por qué

- La cola, de unos 10 s, se reproduce sobre una escena que ya está completa.
- A una segunda visita no le sirven ni el dibujo ni el warp, solo la llegada.
- `vertigo:intro` es almacenamiento en el dispositivo, así que necesita consentimiento.
- El movimiento reducido es una cuestión de seguridad vestibular.

## Qué se descartó

Hacer un seek a `site` para quien vuelve (un corte sin cubrir), una gracia de 3 s, acompasar la cola a lo que aún carga, acortar las esperas y un aviso visible de «saltar».

## Se ha roto si…

- Fallan `introSkip.test.ts`, `introSeen.test.ts`, `returningVisitor.test.ts`, `introDraw.quiet.test.ts`, `useMasterTimeline.test.tsx` («a returning visitor») o `motionPreference.test.ts`.
- En e2e: `boot.spec.ts` (pulsación durante la cola y durante la carga, recuerdo con y sin consentimiento, visita que vuelve), `motion-preference.spec.ts` y `degraded.spec.ts` («prefers-reduced-motion still reaches a ready scene»).

## Afecta a

`src/app/introSkip.ts`, `src/app/introSeen.ts`, `src/app/consent.ts`, `src/intro-draw/returningVisitor.ts`, `src/intro-draw/drawLoop.ts`, `src/experiences/earth/timeline/openingTail.ts`, `src/App.tsx`, `src/components/DebugOverlay.tsx`
