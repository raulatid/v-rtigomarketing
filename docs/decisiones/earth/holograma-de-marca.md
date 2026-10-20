# El holograma de marca: isotipo en reposo, logo al seleccionar, una sola luz

**Estado:** vigente · **Desde:** 2026-09-07 (campo de proyección y `HOLO_COLOR`); bandeja de vidrio desde §53 · **Sustituye a:** DECISIONS §26.21, §26.22 y §53

## Decisión

1. **Un quad por satélite que mira a cámara**, siempre del tamaño de despliegue completo. El shader solo dibuja lo que el despliegue ha abierto.
2. **Solo la selección lo despliega, nunca el hover.** En reposo el campo es cuadrado y muestra el isotipo. Seleccionado, se abre a 2:1 y muestra el logo.
3. **Un único valor suavizado lo mueve todo:**
   - `advanceExpansion` (`panelExpansion.ts`) da el progreso;
   - `deploymentFrom` (`holoDeployment.ts`) deriva las etapas y la proporción del campo;
   - `applyExpansion` escribe a la vez los uniforms del panel y el cono.
   - Con movimiento reducido la duración es 0 y no hay respiración.
4. **El arte se muestra tal como llega, sin tinte:** ajuste *contain* con una ventana difuminada antes del pliegue de la celda del atlas.
5. **En reposo nada tiene borde:** halo de soporte compacto, línea emisora con extremos gaussianos y un cono real (`createEmitterCone`) cuya boca se deriva del panel.
6. **La luz es `HOLO_COLOR`, un único color del sitio, no el de la marca.** `brandColor` sigue usándose en la placa dibujada y en el panel del caso. Si `HOLO_COLOR` vale `null`, vuelve la luz por marca.
7. **Al seleccionar, el logo aterriza en una bandeja de vidrio ahumado** (`panel.glass*`, la densidad A de §37) con un borde de un píxel, y el halo y el lavado de luz bajan.
8. Todos los tamaños se derivan de `PANEL_HEIGHT`. Depuración: `?holo=1&holoExpand=`.

Valores: `src/experiences/earth/orbit/orbitConfig.ts`; shader en `createHoloPanel.ts`.

## Por qué

- Seis logotipos permanentes competían con la Tierra.
- Las marcas registradas deben verse sin dominante de color.
- Una sola luz se lee como una única pieza de hardware.
- Un logotipo blanco sobre el hemisferio iluminado no se lee: necesita la bandeja.
- Todas las versiones con borde se leían como tarjetas.

## Qué se descartó

Logotipos en reposo, desplegar con el hover, un panel teñido por marca con escuadras, scanlines y parpadeo, el panel de vidrio oscuro con línea y marcas de esquina en reposo (el diseño original de §26.22), las alas y raíles del plan 007, la luz por marca y la bandeja sin borde.

## Pendiente de revisión visual

Lo que recuerda el dueño (2026-10-20) es que el panel seleccionado lleva **la línea azul bajo el campo (la línea emisora) y el fondo de vidrio**, que existe para que el logo se lea con la Tierra iluminada detrás.

El código dibuja además:
- un halo;
- el cono de luz;
- un borde de 1 px en la bandeja;
- una modulación suave de la luminancia del arte (barrido y ruido). §26.22 había descartado las scanlines.

Hay que mirarlo con `?holo=1&holoExpand=1` y decidir qué se queda. Hasta entonces, este archivo describe el código.

Además, los valores de la bandeja (`panel.glass*`) repiten a mano los de `siteHeader.css`, y nada comprueba que coincidan.

## Se ha roto si…

- Fallan `panelExpansion.test.ts`, `holoDeployment.test.ts`, `orbitConfig.test.ts` («rests square and unfolds to exactly 2:1», «lands the cone mouth exactly on the field lower edge», «keeps the halo inside the quad…», «keeps the smoked-glass plate a translucent tray…») o `satelliteFocusExpansion.test.ts`.
- **A ojo:** un logotipo en reposo, un rectángulo alrededor de una marca, una bandeja en reposo o una dominante de color.

## Afecta a

`src/experiences/earth/orbit/createHoloPanel.ts`, `panelExpansion.ts`, `holoDeployment.ts`, `createEmitterCone.ts`, `orbitConfig.ts`, `src/experiences/earth/config/protoHolo.ts`
