# Blog y Servicios se suman a las dos puertas

**Estado:** vigente · **Desde:** 2026-09-24 (`ca664a4`), por indicación del cliente; Blog desde Earth vuela a la pantalla desde el 2026-09-26 (`6ca8e38`); Blog es un enlace real que conserva el vuelo desde el 2026-11-23 (auditoría de accesibilidad del 2026-11-18, G1) · **Sustituye a:** la enmienda del 2026-09-24 de DECISIONS §26.16 («the two doors only» queda revertido)

## Decisión

1. **Cuatro entradas en la cabecera de la escena:** Blog, Servicios, Contacto y Auditoría. En escritorio, Blog y Servicios son palabras en la línea, antes de las puertas. En el [menú del móvil](menu-movil.md) son una segunda fila de palabras más pequeñas, sin frase ni flecha; la tarjeta baja más en la escena para dejarles sitio.
2. **Visten como Contacto** (`.scene-shortcut` en `siteHeader.css`: texto, tono y velo) y se desactivan durante un warp.
3. **Dependen de `site`** como el resto (`SceneShortcuts`, `ready`) y entran en la celda de acciones con un portal.
4. **Son un recorrido** (`useSceneShortcuts.ts`), **y Blog además es un enlace:** `<a href="/blog">` (`SceneShortcuts.tsx`). Un clic sin modificadores (`isPlainClick`, `src/app/plainClick.ts`) hace el recorrido y no carga la página; con Ctrl, Cmd, Mayúsculas o el botón central, el navegador abre `/blog` en frío, en otra pestaña. Así lo encuentran un rastreador y la lista de enlaces de un lector de pantalla, y se puede copiar. Durante un warp lleva `aria-disabled` y rechaza el clic simple: un enlace no puede ser `disabled`. Servicios sigue siendo un botón, porque no tiene URL. Como enlace, se activa con Enter y no con Espacio, como cualquier enlace. Las tarjetas, Anterior/Siguiente y «Ver todo el blog» del blog siguen la misma regla (`PageLink` en `BlogRoute.tsx`):
   - **Servicios:** en la ciudad, pide el vuelo al campus (`MurciaExperience.requestServices`). Desde Earth, hace el warp y lo pide al terminar (`onSettled`), solo si `navigateTo` confirma que el warp se lanzó. La ciudad espera a que el rig quede libre y descarta la petición si otra cosa toma la cámara o se sale de la ciudad. Con un distrito abierto no hace nada.
   - **Blog:** ver [entrada por la pantalla](../blog/entrada-por-la-pantalla.md), punto 8.
5. **En móvil, la pulsación espera a que el menú informe `closed`:** la navegación rechaza un warp durante el plegado. En escritorio es inmediato.
6. **La cabecera del blog no los lleva.** Es definitivo.

## Por qué

Cualquier visitante tiene que llegar al blog y al campus de servicios sin buscarlos en la ciudad (indicación del cliente). Cuatro filas grandes no caben sobre la tarjeta; por eso hay una segunda fila.

## Qué se descartó

- Solo dos puertas (decisión del 2026-09-04, revertida).
- Abrir `/blog` directamente desde Earth (con un clic simple; con modificador, sí: es lo que pide quien abre otra pestaña).
- Blog como botón, que es lo que era hasta el 2026-11-23: ni los rastreadores ni la lista de enlaces lo veían (G1).
- Lanzar el vuelo durante el plegado.

## Se ha roto si…

- Fallan `src/components/SceneShortcuts.test.tsx` (incluye que Blog sea un enlace a `/blog` cuyo clic simple hace el recorrido y el modificado no) o `src/app/useSceneShortcuts.test.tsx` (incluye que un warp rechazado no deje una petición pendiente).
- Falla `src/blog/BlogRoute.test.tsx` («links between blog pages»).
- Falla `src/app/navigation/createNavigationInput.test.ts` en que `navigateTo` informe de si lanzó el warp.

## Afecta a

`src/components/SceneShortcuts.tsx`, `src/app/plainClick.ts`, `src/blog/BlogRoute.tsx`, `src/app/useSceneShortcuts.ts`, `src/App.tsx`, `src/components/siteHeader.css`, `src/components/siteMenu.css`, `src/experiences/murcia/MurciaExperience.ts`, `src/app/navigation/createNavigationInput.ts`
