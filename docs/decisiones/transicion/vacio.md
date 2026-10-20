# El vacío al salir de Murcia

**Estado:** vigente · **Desde:** 2026-09-10; sigue a la cinemática desde 2026-09-22 (`3781db7`) · **Sustituye a:** DECISIONS §44 («The vacuum»)

## Decisión

1. **Salir de Murcia aplica un pase de pantalla**: magnificación radial de las UV, desenfoque radial de estela y una viñeta gris. Los tres cuelgan de un único término radial y de una única intensidad.
2. **La intensidad sigue la cinemática ya confirmada** (`vacuumDeparture` en `src/utils/warpTransition.ts`): empieza en el commit y llega al máximo antes del destello. No depende del scroll previo al commit.
3. **Solo en la salida de Murcia.** Vale 0 en Earth, fuera de la cinemática y tras el corte.
4. **Con `prefers-reduced-motion` se mantiene en cero**, no se reinicia.
5. **El pase se desactiva del todo con intensidad 0**, para no costar nada. Va después del afterimage y antes del pase de salida.

Valores: `vacuum*` y `VACUUM_VIGNETTE_COLOR` en `src/utils/warpTransition.ts`; el shader está en `src/graphics/shaders/vacuum.frag`.

## Por qué

- **No es un aumento de FOV**, aunque habría sido menos código. El FOV agranda la huella en el suelo sin coste de distancia, que es justo lo que `check:warp` y `check:footprint` acotan: el borde del mundo aparecería en ultrapanorámico con todos los límites de distancia cumplidos. Un pase de pantalla no puede mostrar nada que la cámara no estuviera viendo ya.
- **Gris y no negro**, porque el negro es el destello, y una viñeta negra se leería como el corte llegando antes de tiempo.

## Qué se descartó

Arrastrar el vacío con el scroll antes del commit, con un umbral y un pestillo en el commit (el diseño original de 2026-09-10).

## Se ha roto si…

Fallan los tests de `vacuumDeparture` en `warpTransition.test.ts` o los del vacío en `SceneCanvas.test.tsx` (incluido «holds the vacuum at zero throughout reduced-motion departure»).

## Afecta a

`src/graphics/vacuumPass.ts`, `src/graphics/shaders/vacuum.frag`, `src/utils/warpTransition.ts`, `src/experiences/murcia/camera/warpPose.ts` (`murciaDepartureVacuum`), `src/components/SceneCanvas.tsx`, `src/graphics/RenderPipeline.tsx`
