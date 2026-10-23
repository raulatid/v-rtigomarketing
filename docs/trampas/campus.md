# Trampas: campus de servicios

Errores reales y comportamientos que parecen bugs pero son intencionados. Las decisiones están en [`decisiones/campus/`](../decisiones/campus/).

## Nodos de la escena

1. **Los nombres de los nodos son la identidad.** Un renombrado en Blender no falla en ejecución: la pieza se queda con el material de la ciudad o el campus se queda como escenario. Fija: `npm run check:asset:contract` §5 (ver [contrato del GLB](../decisiones/build/contrato-del-glb.md)).
2. **`ARCH_Porcelain_White.001` llega como `ARCH_Porcelain_White001`:** GLTFLoader quita el punto. Toda búsqueda pasa el nombre por `PropertyBinding.sanitizeNodeName` antes de comparar. Fija: `campusPalette.test.ts` («finds the dotted roof cap under the name the loader gave it»).
3. **Los nodos del campus son hermanos de toda la ciudad en la raíz,** y el código del laboratorio busca el lago alrededor del centro de la raíz que recibe. Sin `gatherCampus`, ese centro es el de la ciudad y el «lago» puede ser una piscina de la entrada. Fija: `gatherCampus.test.ts`.
4. **`PARK_Water` es una sola malla con el lago y las dos piscinas.** Desde el 2026-10-23 las piscinas también entran, como todo el campus; antes solo contaba lo que quedaba cerca del centro del lago (`LAKE_REACH`, retirado). Fija: `campusInteraction.test.ts` («enters from a pool the water node also holds»).
5. **En el GLB que se publica, `CAMPUS_PALETTE` no hace nada visible:** todas las piezas llevan `lightmap_atlas` y la paleta las salta. Cambiar un color ahí solo afecta a una exportación sin hornear. Sin test del salto.

## Cámara

6. **`lookTarget` es del campus, no el foco del rig.** El foco está en el suelo y la cámara mira a `lookAtHeight`; por eso `seed()` se llama justo antes de cada entrada. Fija: `check:campus` §3 («the fly-in starts looking where the visitor was looking»).
7. **La pose de vuelta se captura en `enter`, no al construir.** Capturarla al construir devolvería al visitante a la pose de llegada. Fija: `check:campus` §3 («the exit lands on the pose entered from») y `section/campusCamera.test.ts` («leaves the overview alone…»).
8. **La cámara del campus informa «control devuelto» también al liberarse, haya volado o no.** El adaptador solo devuelve si tiene la reclamación `'campus'`; si no, `onReturn` y `adoptFromCamera` moverían una cámara que nadie movió. Fija: `check:campus` §6 y §6b.
9. **`onCameraReturned` corre con el rig ya libre.** Una pose aplazada aplicada antes movería una cámara reclamada. Fija: `check:campus` §1 («the rig was already free when the hand-back hook ran»).
10. **`CAMPUS_DOCK_QUERY` está escrita dos veces:** en `campusMobileLayout.ts` y en la media query de `murcia.css`. Si difieren, la cámara encuadra para una composición y la hoja de estilos dibuja otra. Sin test.
11. **`campusCompactFraction` invierte la cuenta de `campusMobileFraming`** y comparte sus constantes. Cambia una sin la otra y la hoja reclamará un sitio que el encuadre no tiene: las partículas encogen sin error. Fija: `campusMobileLayout.test.ts` («never pulls the camera further back than the fraction that shipped», que barre viewports).

## Entrada

12. **Dentro de la sección, `campusInteraction` es el único que actúa:** el paneo rechaza las pulsaciones porque el rig está reclamado, no por el orden de los listeners. Fija: `check:campus` §2.
13. **Al soltar, primero se cierra la secuencia y después se mira `enabled`.** Al revés, el campus se queda sordo en los móviles, donde salir de Murcia es un pellizco y los dedos siguen abajo al congelarse la ciudad. Fija: `campusInteraction.test.ts` («still enters after a gesture that was disabled between its press and its release»).
14. **El paso espera a `settled()`, no a `field.morph`.** Un servicio gira de símbolo a figura por su cuenta, y un paso no debe rechazarse durante medio giro. Sin test.
15. **Salir no espera al vuelo; avanzar, sí.** Escape, la flecha y el pellizco llaman a `exit()` en cualquier momento. Los comentarios que dicen que un vuelo ignora la salida (`e2e/navigation.spec.ts`) no describen el código. Sin test.
16. **Las teclas se escuchan en `window`:** se ignoran sin `enabled`, en la vista general, con modificadores o dentro de un campo de texto, y no se hace `preventDefault`. Fija: `campusInteraction.test.ts` («leaves keys typed into a field to the field», «is deaf to keys and swipes while disabled», «ignores the section keys»).
17. **En el móvil, la hoja recoge el puntero** (`pointer-events: auto !important` en `murcia.css`): un arrastre sobre ella no da un paso. El comentario de `murcia.css` que dice que una pulsación sobre la placa llega a la ciudad solo vale para la placa de escritorio. Sin test.

## Contenido

18. **Un servicio mal rechaza el documento entero** y el campus se queda como escenario, aunque los demás estén bien. El build lo para antes. Fija: `campusContent.test.ts` («rejects the set when a colour is not #rrggbb»), `content/collections/collections.test.ts`.
19. **Un símbolo que no está en `CAMPUS_ICONS` hace lanzar a `attachServicesCampus`.** Fija: `content/campusIcons.test.ts` («are exactly the ones the library draws»).
20. **El muestreador lee el ALFA del SVG:** un hueco es un subtrazado, nunca un relleno oscuro, y una línea que cruza un círculo pone tinta donde debía leerse un contorno (por eso `nodes` corta sus segmentos). `repeat` se construye con esas muestras. Fija en parte: `content/campusIcons.test.ts` («each carry square SVG markup the sampler can read»).
21. **Quitar algo de la placa es quitarlo de extremo a extremo.** En `e495f51` se quitó la descripción de la placa y se dejaron el campo, la validación, el cálculo y los estilos: el editor escribía un texto que no aparecía. Hoy están así `figureCaption` y el rótulo «Qué medimos» (`measuresLabel.hidden` siempre verdadero, aunque `campusLabels.ts` y el overlay siguen llevándolo). Sin test.
22. **Reescribir el texto de un servicio no avisa de su figura.** La figura sigue siendo la que se eligió; solo la descripción del campo en el Studio lo recuerda. Sin test.

## Partículas

23. **Un destino tiene que dar un punto a cada partícula.** Las muestras de un símbolo se toman con el número actual de partículas; un `rebuildParticles` vacía la caché. Con menos muestras, el destino lanza («too few samples»). Sin test.
24. **`setLayout` borra la capa viva:** la capa viva se pone después. Sin test.
25. **Con el movimiento a cero no se pone capa viva.** Con ella, cada fotograma recalcula y sube todos los destinos para dejarlos igual. Fija: `particles/figureLayouts.test.ts` («… is stationary with reduced motion»).
26. **`accentShare` necesita `rebuildParticles`**, no `applyParticles`: el tono se escribe una vez por partícula, desde su propio flujo aleatorio para no mover la subida. Sin test.

## Tira LED

27. **Nada mide la frase contra el paso entre copias.** Con una frase más larga hay que bajar `REPEATS`; la única señal es el aviso de consola de `facadeRenderer.ts` cuando una línea se sale por el lado. Sin test.
28. **La frase de la tira no sigue a `district.label`:** está en `campusScreenContent.ts`. La descripción del campo en el Studio lo dice. Sin test.
29. **Con movimiento reducido la tira sigue deslizándose:** `screenPlayer.ts` solo quita el brillo y el polvo. Sin test.

## Con el resto de Murcia

30. **`createServicesCampus` conserva la forma exterior del distrito borrado** (`isEngaged`, `isFlying`, `anchor`, `screenPoint`, `releaseFocus`, `setEnabled`), y `MurciaExperience` la lee como `hasFocusedDistrict`. De ese nombre cuelgan la retirada de la navegación, el logo y la salida por pellizco: «distrito» en `App.tsx` y en la navegación significa hoy «campus». Fija: `pinchInput.test.ts`; el resto, solo en e2e.
31. **Los puntos de depuración siguen llamándose `__vertigoDistrictPoint` y `__vertigoDistrictSettled`** (y `__vertigoCampus`), solo en builds con depuración. `e2e/mobile.spec.ts` los usa: no los renombres sin él.
32. **Un tap en el punto de Servicios lo oyen dos listeners:** `CampusInteraction`, si cae sobre el campus, y `PoiInteraction`. Entra una sola vez porque la segunda llamada encuentra la cámara tomada y se rechaza (`MurciaExperience.activatePointOfInterest` exige la vista general). No le pongas al punto una entrada propia que salte esa comprobación. Fija: `poiInteraction.test.ts`; la entrada única, sin test. (Hasta el 2026-10-21 este número era el parpadeo, retirado.)

## Objetivos del tap

33. **Los árboles del parque no son nodos del campus:** son instancias de las mallas de árboles de toda la ciudad. `splitCampusTrees` (en `createServicesCampus`) saca a mallas propias las instancias que tienen debajo `SITE_Light_Limestone` o `PARK_Grass`, con sus matrices y su `_LIGHTMAP_ST`, y compacta la malla de la ciudad bajando su `count`. Si el suelo del campus se renombra, no se separa ningún árbol y no responden; si se separan sin copiar `_LIGHTMAP_ST`, el árbol lee otra parcela del atlas. Fija: `campusTrees.test.ts`.
34. **El agua y la tira LED responden al tap pero no se iluminan:** el resaltado clona el material, y el agua lleva el del río (compartido con la ciudad) y la tira el de la pantalla, cuyos uniformes de ejecución quedarían congelados en el clon. Sin test.

## Posibles defectos

Vistos leyendo el código, no comprobados ejecutando.

- **Se puede volver a entrar durante el vuelo de salida.** Con la salida en vuelo, el estado ya es la vista general y el adaptador aún tiene la reclamación, así que `enter()` acepta un tap. La nueva pose de vuelta se captura a mitad de vuelo: la segunda salida no aterrizaría en la pose de antes de la primera visita. `e2e/mobile.spec.ts` espera a que acabe el vuelo antes de volver a entrar, así que no lo vería. Sin test.

## Ya migradas en otras áreas

- Un solo dueño de la cámara por fotograma, el `setPose` aplazado y la tolerancia de tap del campus: [`murcia-camara.md`](murcia-camara.md), n.º 17, 19 y 26.
- Volver a `setEnabled(this.active)` tras la aproximación del blog: [`blog.md`](blog.md), n.º 14.
- La lista «Layer stack» sin el campus, `campus:*` fuera de `PRIORITY`, retirar las peticiones del cursor al desactivarse, el dedo resuelto donde aterrizó y el clic sintético que se traga `sheetDrag`: [`interfaz.md`](interfaz.md), n.º 37, 40, 41, 45 y 46.
- `warm()` debe revelar el campo de partículas: [`transicion.md`](transicion.md), n.º 20.
- `checks/campus-sheet.mjs` fuera de toda cadena, sin `typecheck` y hoy en rojo: [`build.md`](build.md), n.º 23 y 25, y «Posibles defectos».

## Cómo verificar esta área

| Cambio | Comprobación |
|---|---|
| Cámara, devolución, resize durante la visita | `npm run check:campus`; `section/campusCamera.test.ts` |
| Entrada, paso, salida, teclado | `campusInteraction.test.ts`, `section/campusState.test.ts`, `district/ui/districtA11y.test.ts` |
| Contenido y formas | `campusContent.test.ts`, `content/campusIcons.test.ts`, `content/collections/collections.test.ts` |
| Partículas y figuras | `particles/particleField.test.ts`, `particles/figureLayouts.test.ts` |
| Placa y hoja | `section/campusOverlay.test.ts`, `section/campusSheet.test.ts`, `campusMobileLayout.test.ts`; `node checks/campus-sheet.mjs` a mano (hoy falla); inspección en un móvil y en un portátil de pantalla baja |
| Tira LED | `landmark/towerScreen/mediaFacade.test.ts`, `campusScreen/attachCampusScreen.test.ts`, `screens/screenPlayer.test.ts`; mirar la tira girando |
| Nodos del GLB | `npm run check:asset:contract` |
| Recorrido con dedo y pellizco | `e2e/mobile.spec.ts`, solo si se pide e2e |
| Cualquier cambio visual | inspección: la intro formada, un servicio con figura, uno sin figura, la placa en escritorio y la hoja en las dos paradas |

**Sin cobertura:**
- el arrastre y el scroll de la hoja en un navegador (la prueba existe y falla);
- que placa o hoja y disco no se solapen;
- que el paso espere al vuelo y la salida no;
- el salto de la paleta con el campus horneado;
- la tira con movimiento reducido;
- volver a entrar durante el vuelo de salida.
