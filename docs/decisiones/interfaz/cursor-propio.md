# El cursor propio: uno para toda la sesión, y cada fuente publica una petición

**Estado:** vigente · **Desde:** 2026-08-07 (`adc5c6e`, DECISIONS §14); apagado en el blog desde el 2026-08-31 (`950edce`); movimiento reducido leído de `prefersReducedMotion()` desde el 2026-09-15 (`c5f0021`) · **Sustituye a:** DECISIONS §14; la fila «`CustomCursor` is Earth-only» de «Superseded»

## Decisión

1. **`CustomCursor` se monta una vez para toda la sesión** (`src/App.tsx`), no por experiencia. Solo se apaga con el blog abierto (`enabled={!blogOpen}`, ver [escena congelada](../blog/escena-congelada.md)); un `/blog` en frío no lo carga (ver [segundo documento](../blog/segundo-documento.md)).
2. **Solo con puntero fino** (`(pointer: fine)` al montarse); en táctil queda el nativo. Mientras está activo, `has-custom-cursor` en `<html>` oculta el cursor nativo en todos los elementos (`styles.css`).
3. **Nadie escribe `style.cursor` para cambiar lo que se ve.** Cada fuente pide un estado (`'pointer'`, `'grabbing'` o nada) al `CursorManager` de su experiencia (`src/interaction/cursorManager.ts`) con una clave propia (`fuente` o `fuente:instancia`). El árbitro resuelve por `PRIORITY` (un arrastre gana) y publica en `cursorSignal` (`src/interaction/cursorSignal.ts`), al que se suscribe el cursor. El `style.cursor` del canvas es solo el respaldo para cuando el cursor propio no está montado.
4. **Un árbitro por experiencia:** Earth crea el suyo en `InteractionLayer`; Murcia, en `MurciaExperience`. Todas las fuentes de una experiencia comparten el suyo.
5. **Al dejar de estar activa, cada experiencia retira todas sus peticiones,** porque el `update()` por fotograma que las resolvería deja de correr. Murcia llama a `cursor.clear()`; Earth las retira fuente a fuente (`setEnabled(false)` en el foco de satélites, `deactivate()`/`endDrag()` en el rig).
6. **El hover del DOM se suma sin árbitro:** sobre `INTERACTIVE_SELECTOR` el cursor muestra `'pointer'` si la escena no pide nada.
7. **Movimiento:** la mano va pegada al puntero y el anillo la sigue con un lerp exponencial (`FOLLOW_RATE`, independiente de la frecuencia de refresco); con movimiento reducido, el anillo salta. Su rAF solo mueve el DOM, se despierta con `pointermove` y se para cuando el anillo alcanza al puntero: cumple la [regla de los bucles](../render/un-renderer-para-la-escena.md).

Los glifos están en [glifos del cursor](glifos-del-cursor.md).

## Por qué

- Montado solo en Earth, al entrar en Murcia volvía la flecha del sistema: desmontar quita `cursor: none`.
- Con un árbitro el resultado es determinista; dos fuentes que escriben `style.cursor` se pisan y gana la última.
- Dos árbitros en el mismo canvas devuelven ese parpadeo. Earth y Murcia tienen uno cada una porque nunca están activas a la vez y cada una debe poder soltar todo lo suyo al irse.
- Señal de módulo y no un ref: el árbitro vive dentro de la escena y el cursor en la raíz.

## Qué se descartó

- `{earthActive && <CustomCursor />}`.
- Escribir `style.cursor` desde cada fuente.
- Un único árbitro para los dos mundos, o pasarlo por props hasta la raíz.

## Se ha roto si…

- Al entrar en Murcia aparece la flecha del sistema, o la mano señaladora se queda puesta al volver a Earth (sin e2e).
- Una fuente escribe `canvas.style.cursor`. Fija: `panelPointer.test.ts` («publishes its hover through the cursor manager, never the canvas style»).
- Una experiencia desactivada mantiene su petición. Fijan: `campusInteraction.test.ts` («go out when the city is switched off mid-hover», «releases its cursor request when disposed») y `panelPointer.test.ts` («drops the hint when it is disabled mid-hover», «lets go of the cursor hint on dispose»). En Earth, sin test directo; `cursorManager.ts` y `CustomCursor.tsx` no tienen tests propios.

## Afecta a

`src/components/CustomCursor.tsx`, `src/interaction/cursorManager.ts`, `src/interaction/cursorSignal.ts`, `src/App.tsx`, `src/styles.css`, `src/experiences/earth/interaction/InteractionLayer.tsx`, `src/experiences/earth/interaction/createSatelliteFocus.ts`, `src/experiences/earth/camera/createFocusCameraRig.ts`, `src/experiences/murcia/MurciaExperience.ts`, `src/experiences/murcia/campus/campusInteraction.ts`, `src/experiences/murcia/blogDisplay/panelPointer.ts`
