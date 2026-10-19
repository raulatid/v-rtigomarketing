# Banda de zoom y commit entre mundos

**Estado:** vigente · **Desde:** 2026-09-22 (`3781db7`, navegación unificada) · **Sustituye a:** DECISIONS §44 (recorrido, pellizco, salida de Earth sin empuje), ADR 009, 012, 014 y 015 en lo que dicen de la banda y el commit

Aquí, *commit* es el momento en que la transición entre la Tierra y Murcia queda confirmada y ya no se puede deshacer.

## Decisión

1. **El zoom es una posición que el visitante posee.** Se queda donde la deja. La banda tiene dos mitades: hacia el otro mundo (Earth acercándose, Murcia alejándose) y hacia el extremo muerto, que no hace nada al llegar.
2. **Ambos mundos comparten la misma banda y el mismo commit.** Con rueda o trackpad, llegar al final de la mitad que mira al otro mundo hace el commit. **No hay etapa de empuje** después del final.
3. **Con el dedo, el commit exige un pellizco nuevo que empiece en el final de la banda** y crezca al menos `releaseGrowthPx`. Un pellizco que empieza antes del final solo hace zoom, aunque llegue al final.
4. **Dos dedos solo significan pellizco.** No hay rotación con dos dedos ni árbitro entre ambos gestos: el par se arma con el segundo contacto y mueve la banda desde la primera muestra.
5. **`releaseGrowthPx` es el único umbral del pellizco.** Protege lo que no se puede deshacer: cerrar una pantalla enfocada y el commit táctil. Alimentar la banda no necesita umbral, porque un píxel de más se recupera con un píxel de vuelta.
6. **El bloqueo de entrada y el enfriamiento tras una transición son compartidos** por ambos mundos.
7. Los efectos de pantalla de la salida (el «vacío» de Murcia, el giro de Earth hacia España) siguen a la cinemática ya confirmada. Ninguno exige seguir haciendo scroll tras el commit.

Valores: `NAVIGATION_ZOOM`, `NAVIGATION_PINCH` y `NAVIGATION_COOLDOWN` en `src/app/navigation/navigationConfig.ts`.

## Por qué

- La etapa de empuje (aparcar en el límite y empujar contra él) se leía como que la cámara «se congelaba» hasta otra entrada. Unificar ambos mundos eliminó el acumulador y la diferencia entre ellos.
- Exigir un pellizco nuevo en el final evita que un mismo gesto de zoom cruce de mundo sin querer.
- La garantía contra un warp accidental es la propia longitud de la banda: varios eventos de rueda con tope desde el reposo.

## Qué se descartó

- La etapa de empuje de ADR 014 y `commitAtBandEnd`, en ambos mundos.
- El clasificador de pellizco (`pinchClassifier`) y la rotación con dos dedos (ADR 015).
- Mantener un commit «retenido» hasta que la cámara estuviera alineada; el giro de Earth hacia España ocurre ahora después del commit.

## Se ha roto si…

- `npm run check:navigation` falla (§7: dos contactos son un pellizco y no los gestiona Murcia).
- Fallan los tests de `src/app/navigation/` (`createNavigationInput`, la banda de zoom).

## Afecta a

`src/app/navigation/navigationConfig.ts`, `src/app/navigation/createNavigationInput.ts`, `src/app/navigation/zoomBand.ts`, `src/app/navigation/continuousState.ts`, `src/interaction/navigationSignals.ts`
