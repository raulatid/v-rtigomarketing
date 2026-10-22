# Conócenos: tres paradas en la torre Vértigo, de la pantalla al cielo

**Estado:** vigente · **Desde:** 2026-10-22 (plan 027, sin commit todavía) · **Sustituye a:** el punto 5 de [edificios interactivos](edificios-interactivos.md) («Conócenos todavía no tiene destino»)

## Decisión

1. **Se entra pulsando el punto Conócenos o la base de la torre** (`ARCH_Glass_Lobby`), con el cursor de mano sobre los dos, como Blog y Servicios. Solo desde la vista general: con la cámara tomada (campus, blog, warp) la pulsación se rechaza. Sin documento de Conócenos en Sanity, la base no tiene destino y el punto no es pulsable (`clickable` en `poiInteraction.ts`).
2. **Tres paradas en fila, sin vuelta circular** (`about/createAboutSection.ts`):
   - **Pantalla:** de frente a `LED_Main`, llenando `SCREEN_FILL` de su eje más justo;
   - **Azotea:** el isotipo visto desde arriba, para que no entre el horizonte;
   - **Cielo:** desde detrás y por debajo del isotipo, inclinada hacia arriba, con la placa del CTA.

   Las poses se calculan de la geometría de la torre, no se escriben (`about/aboutPoses.ts`: `solveScreenView`, `SCREEN_NDC`, `ROOFTOP_*`, `SKY_OFFSET`, `SKY_NDC`). El encuadre desplaza la cámara, no la gira, como el [campus](../campus/camara-propia.md). Escritorio o móvil lo decide `CAMPUS_DOCK_QUERY`, la consulta de la placa.
3. **La cámara es de la sección durante toda la visita**, con la reclamación `'about'` (`about/aboutCameraAdapter.ts`), y se devuelve como la del campus: `adoptFromCamera` en la pose capturada al entrar y después `release('about')`. Su peldaño en la escalera de `MurciaExperience.update` está junto al del campus: «la sección ya escribió la cámara». Un resize con la cámara tomada guarda la pose del rig en `deferredPose`, y la sección hace `reframe()`.
4. **Se pasa de parada con las flechas de la placa, ←/→ o un deslizamiento; se sale con la flecha de vuelta, Escape o un pellizco hacia fuera.** Un paso se rechaza en pleno vuelo, como en el campus. Los vuelos duran lo que los del campus (`FLIGHT_SECONDS`, `REDUCED_FLIGHT_SECONDS`).
5. **La placa es la del campus** (`campusOverlay.ts` con la clase `campus-overlay--about`), acoplada a la derecha en escritorio y en hoja en el móvil. La parada del cielo lleva tres acciones ([placa y hoja](../campus/placa-y-hoja.md)):
   - **Contacto** abre el diálogo de contacto (`openRequest` de `ContactSection`, el mismo patrón que la auditoría);
   - **Auditoría** abre la auditoría (`handleRequestAudit`, el que usa el panel del caso);
   - **«Ver sus casos»** lanza el warp a Earth **desde la parada del cielo, sin volar antes de vuelta**. `App` permite ese warp solo mientras dura la petición (`sectionDepartureRef` y `canDepartFromSection`). En el peldaño del warp, si la sección tiene la cámara, el warp mueve la cámara de la sección: sube y se inclina hacia el cénit (`DEPARTURE_RISE`, `DEPARTURE_PITCH_DEGREES` en `aboutCamera.ts`). En el corte, `abandon()` deja la cámara en la pose de entrada y la devuelve al rig, así que la vuelta a Murcia sale de donde estaba el visitante antes de la visita.
6. **La pantalla LED cambia de contenido durante la visita** (ver [pantallas compartidas](../arquitectura/pantallas-compartidas.md)): las diapositivas de Conócenos se construyen con las de la torre al cargar la ciudad, fuera de la rotación, y `setPlaylist` cambia de lista al entrar y al salir. Construir una composición no descarga nada: sus imágenes se piden la primera vez que se muestra.
7. **Un barrido de luz recorre el isotipo durante la visita** (`landmark/createLogoSweep.ts`): una banda estrecha que se mezcla en `outgoingLight`, como el tinte de los edificios, sobre un clon del material del logo. Sube al entrar y baja al salir. Fuera de la sección está apagado.
8. **Satélites en el cielo de la parada 3** (`sky/skyPasses.ts`, `sky/createSkySatellites.ts`, `about/aboutSky.ts`):
   - cada uno recorre un círculo máximo a velocidad constante, así que en pantalla cada pasada es una línea recta; solo se ve donde el cielo es oscuro y se desvanece al salir de esa zona;
   - una vez por vuelta, en el punto más bajo (siempre bajo el horizonte), su plano gira alrededor de la vertical: cada pasada es una línea nueva, apuntada a la zona del cielo que encuadra la parada (`SKY_FOCUS_NDC` en `aboutPoses.ts`);
   - van por parejas que cruzan a la vez en sentidos opuestos;
   - la posición es función del tiempo, no del número de fotogramas;
   - solo se dibujan y se calculan mientras la sección tiene la cámara.
9. **Paneles de marca en DOM** (`about/brandPanels.ts`): un cuadrado de [vidrio ahumado](../interfaz/vidrio-ahumado.md) de densidad A con el isotipo del caso, junto a su satélite, proyectado cada fotograma después de quien movió la cámara, como los puntos de interés. Planificador puro (`sky/panelSchedule.ts`):
   - de dos en dos, con su entrada, permanencia y salida (`PANEL_TIMING`), y un hueco entre turnos;
   - las marcas van en rotación estricta: ninguna se repite hasta que han salido todas. Una marca no va atada a un satélite: cada turno va al satélite que pueda llevarlo;
   - solo un satélite que vaya a seguir en cuadro, encendido y fuera de la placa durante todo el panel; la trayectoria se conoce, así que se calcula. Con uno disponible sale uno; con ninguno, se espera. Un candidato solo puede esperar `PAIR_PATIENCE` a que se le una otro.
   - las marcas son los casos con isotipo; sin ninguno, hay satélites pero no paneles.
10. **Movimiento reducido: los vuelos lo respetan, el cielo no.** Con movimiento reducido, los vuelos de cámara son el corte corto del campus y del blog, y la salida hacia Earth no tiene pose de subida (corte y `abandon`). Pero **la LED, el barrido del isotipo, los satélites y los paneles siguen** por decisión del usuario: con la cámara quieta, es una vista con puntos que se mueven, y quitarlos deja la parada sin sentido. Es lo contrario de las [partículas del campus](../campus/particulas-y-movimiento-reducido.md), que se quedan quietas: no es un descuido, no se «corrige». El giro del logo sí se para, como siempre (`createTowerLogo.ts`).
11. **Qué decide el editor** ([qué decide el editor](../contenido/que-decide-el-editor.md)): el singleton `aboutSection` es opcional, de cero o un documento ([contrato de campos](../../content/sanity-field-contract.md)). Decide los textos de las tres paradas, las etiquetas de los tres botones y las diapositivas de la LED, con la plantilla y los límites de la [pantalla de la torre](../contenido/pantalla-de-la-torre.md). Los isotipos de los paneles son los de los casos. Encuadres, tiempos, número de satélites y el barrido son código.
12. **Gancho de depuración** `__vertigoAbout` (`enter`, `next`, `previous`, `back`, `exit`, `snapshot`), solo con `debugTools`.

## Por qué

- La torre es la sede: la pantalla dice quiénes son, la azotea enseña la marca y el cielo, con sus satélites, recuerda los casos que están en Earth.
- Una reclamación propia y un peldaño propio: sin el peldaño, una reclamación nueva congela la cámara ([trampas de la cámara](../../trampas/murcia-camara.md), n.º 17).
- El warp sale desde el cielo porque la parada ya mira arriba, y salir de Murcia «es subir» ([warp](../transicion/warp.md)). Volar antes a la vista general alargaba el CTA dos vuelos.
- Las diapositivas se construyen al cargar para que entrar no tenga un parón; no cuesta descargas.
- Satélites en línea recta y paneles DOM pequeños: una órbita en anillo o discos siempre visibles tapaban el cielo que la parada enseña.
- Una marca por satélite dejaba casi todos los turnos sin candidato: el encuadre del móvil mide unos 17° y la placa de escritorio tapa el centro-derecha del cielo (simulado el 2026-10-22). Con la rotación separada de los satélites, la regla de no repetir se cumple al pie de la letra.

## Qué se descartó

- Una recepción con puertas e interior modelado.
- Satélites dentro de Murcia con el modelo de Earth, y la panorámica del cielo de Earth ([cielo de Murcia](cielo-de-murcia.md)).
- La órbita en anillo y los discos blancos con logo siempre visibles junto a cada punto.
- Reutilizar `createHoloPanel.ts` de Earth: es una proyección de 683 líneas atada a la configuración de Earth, y Murcia no puede importar Earth.
- Volar de vuelta a la vista general antes del warp de «Ver sus casos».
- Un satélite por marca, con la marca fija.
- Un atajo «Conócenos» en la cabecera (de momento) y el barrido del isotipo siempre activo (se valora después).

## Se ha roto si…

- Falla `npm run check:about` (`checks/about-section.ts`): §1 un solo escritor; §2 el arrastre no mueve nada; §3 la salida aterriza en la pose de entrada; §4 independencia de los fps; §5 no suelta reclamaciones ajenas; §6 resize aplazado; §7 «Ver sus casos» sale desde el cielo y su corte restaura la pose de entrada.
- Fallan `about/aboutPoses.test.ts`, `about/aboutCamera.test.ts`, `sky/skyPasses.test.ts` («mostly cross what the sky stop frames»), `sky/panelSchedule.test.ts`, `landmark/createLogoSweep.test.ts`, `landmark/towerScreen/carousel.test.ts`, `screens/screenPlayer.test.ts`, `pointsOfInterest/poiInteraction.test.ts` o `src/components/ContactSection.test.tsx`.
- Fallan `src/content/about.test.ts`, `content/collections/collections.test.ts` o `src/content/generated.test.ts`, o `check:studio`.
- Encuadres, barrido, satélites y paneles se juzgan mirando: las tres paradas en 1440×900 y 390×844, y la parada del cielo durante un minuto (no con capturas sueltas).

## Afecta a

`src/experiences/murcia/about/`, `src/experiences/murcia/sky/`, `src/experiences/murcia/landmark/createLogoSweep.ts`, `src/experiences/murcia/landmark/towerTargets.ts` (`screenFrame`, `logoCentre`), `src/experiences/murcia/landmark/towerScreen/carousel.ts` y `src/experiences/murcia/screens/screenPlayer.ts` (`setPlaylist`), `src/experiences/murcia/camera/CameraRig.ts` (`CameraClaim`), `src/experiences/murcia/campus/section/campusOverlay.ts` (acciones), `src/experiences/murcia/pointsOfInterest/`, `src/experiences/murcia/MurciaExperience.ts`, `src/experiences/murcia/MurciaLayer.tsx`, `src/components/SceneCanvas.tsx`, `src/App.tsx`, `src/components/ContactSection.tsx`, `src/experiences/murcia/styles/murcia.css` (`.campus-overlay--about`, `.campus-overlay__actions`, `.about-brands`), `src/content/about.ts`, `content/collections/aboutSection.collection.ts`, `sanity-studio/schemas/aboutSection.ts`, `checks/about-section.ts`
