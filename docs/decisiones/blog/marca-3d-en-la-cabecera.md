# La cabecera del blog dibuja la marca 3D, y es el único 3D que paga el blog

**Estado:** vigente · **Desde:** 2026-09-04 (enmienda de ADR 013), por indicación del cliente; sin bake ni KTX2 desde el 2026-09-05 (plan 019 §3) · **Sustituye a:** la enmienda del 2026-09-04 de ADR 013; la enmienda del 2026-09-04 de DECISIONS §26.16 («the brand cell is 3D on the blog too»); las filas «The cold blog document is 2D by construction» y «The application has one WebGL renderer» de «Superseded»

## Decisión

1. **La celda de la marca del blog muestra el mismo logo 3D que la escena**, en los dos documentos (frío y caliente), con `createCornerLogo` sin cambios.
2. **El SVG es la primera pintura y el respaldo permanente.** `BlogHeaderLogo` pinta `VertigoMark` y solo funde al canvas cuando el GLB ha llegado y está compilado. Cualquier fallo (sin WebGL2, un 404 del GLB, contexto perdido, un chunk que no carga tras un despliegue) deja el SVG.
3. **El 3D se pide después de la página.** El módulo se importa de forma dinámica tras `load` y en un momento ocioso (`afterLoad` en `BlogHeaderLogo.tsx`), para que los bytes del lector vayan primero al texto.
4. **Es un segundo `WebGLRenderer`, y vive fuera de la escena.** `src/blog/headerLogoRuntime.ts` crea su propio canvas y su renderer (`alpha: true`, `powerPreference: 'low-power'`), con el mismo tone mapping y espacio de color que el Canvas de R3F. En una sesión caliente hay dos contextos: el de la escena, congelado, y este.
5. **Una instancia por documento, que se recoloca y no se reconstruye.** `Index` y `Article` son componentes distintos, así que la cabecera se desmonta en cada cambio de página; la instancia sobrevive y mueve su canvas al nuevo contenedor.
6. **Su bucle rAF corre lo mínimo:** se para fuera de pantalla, con la pestaña oculta, al desacoplarse y siempre con movimiento reducido (la marca sigue siendo 3D, pero no gira). Pendiente de confirmar con el usuario: si es intencionado que, con movimiento reducido, la marca del blog no gire y la de la escena sí (según el comentario de `sync` en `headerLogoRuntime.ts`; no se ha comprobado el comportamiento de la escena).
7. **Si falla una vez, no se reintenta en todo el documento** (`unavailable`). Al salir de la página (`pagehide`) se libera y se devuelve el contexto.
8. **Carga exactamente lo de la marca:** three.js, el decodificador Draco y el GLB de `MODEL_URL` (`src/corner-logo/loadLogoAssets.ts`). Sin bake ni KTX2.

**Frontera:** la regla «un solo renderer» (DECISIONS §2, ADR 001 y ADR 002) es del área de render y gráficos, todavía sin migrar. Esta decisión solo acota la excepción: la regla se refiere al renderer de la ESCENA, y este segundo contexto es de la cabecera del blog y del 404. Al migrar esa área, la decisión de render debe enlazar aquí en vez de repetirlo. La cabecera en sí (celda de la marca, barra negra) es del área de interfaz.

## Por qué

El cliente quería en la cabecera del blog la misma marca que en la escena, y la prefirió a un giro prerenderizado o a una imagen fija. Una marca 3D en un sitio y plana en otro se lee como un error.

## Qué se descartó

- Un giro prerenderizado del mismo GLB, o una imagen estática.
- Un renderer por componente: perdería el contexto, volvería a pedir el GLB y recompilaría en cada artículo, con un parpadeo al SVG.
- Precargar el chunk de la marca en `/` (`isHeaderLogoChunk` en `vite.config.ts` lo excluye).

## Se ha roto si…

- `e2e/blog.spec.ts`, «a cold /blog pays for the mark and nothing else»: hay más de un canvas, se pide algo pesado que no sea de la marca, o lo 3D se pide antes que la interfaz del blog o que la imagen del CMS.
- En caliente no hay exactamente dos canvas (sin contar `.intro-canvas`): lo comprueba «a warm round trip…».
- `check:architecture` falla en «… reaches the 3D mark ONLY through that dynamic seam» o en «… IS reachable to the 3D mark, dynamically».
- El build falla con «expected exactly one chunk faced by src/blog/headerLogoRuntime.ts».
- La marca parpadea al SVG al abrir un artículo (inspección visual).

## Afecta a

`src/blog/BlogHeaderLogo.tsx`, `src/blog/headerLogoRuntime.ts`, `src/corner-logo/createCornerLogo.ts`, `src/corner-logo/loadLogoAssets.ts`, `vite.config.ts` (`HEADER_LOGO_MODULE`, `isHeaderLogoChunk`), `checks/architecture.ts`
