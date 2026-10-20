# La vista previa del Studio reutiliza los componentes y el CSS del sitio

**Estado:** vigente; decidida como regla el 2026-10-20 por indicación del usuario; su check está pendiente · **Desde:** 2026-09-15 (`af9ac2f`, vistas previas de borradores); paneles y formularios del sitio desde 2026-09-16 (`d5ed03e`) · **Sustituye a:** la regla anterior de que el Studio solo alcanza módulos hoja fuera de su paquete (comentario de cabecera de `src/content/editorialBounds.ts`, que sigue diciéndolo; DECISIONS §31 y ADR 011 en lo que dicen de la separación de paquetes)

## Decisión

1. **El editor ve lo mismo que se publicará.** La pestaña «Vista previa» de cada documento (`sanity-studio/components/DocumentPreview.tsx`) dibuja el borrador con los componentes del sitio (`CasePanel`, `LegalBlock`, `ContactSection`, `AuditSection`, `PostBody`, `BlogFigure`) y con su CSS y sus fuentes (`sanity-studio/components/previewStyles.ts`), no con una imitación.
2. **El borrador se convierte con el código del build.** `sanity-studio/components/previewModel.ts` reutiliza `richBlocks` y `Report` de `content/lib/` para dar a los componentes la misma forma que recibirían del contenido generado.
3. **El Studio sigue siendo un paquete aparte.** Importar código del sitio es la única excepción, y va en un sentido: nada del Studio entra en el bundle del sitio.
4. **La vista previa se dibuja en un iframe aislado** (`sandbox`), sin pedir contenido de forma anónima, sin guardar credenciales y sin publicar ni enviar formularios. La escena 3D no se incrusta: servicios y documentos legales tienen una vista de lectura, y lo que depende de la escena (partículas, figuras, la pantalla de la torre) se comprueba en la web.
5. **El CSS y las fuentes se cargan tras un `import()` dinámico** (`LazyDocumentPreview.tsx`), para que la extracción del esquema (`check:schema`, antes de `sanity build` y `sanity deploy`) no evalúe imports `?raw` y `?url`, que solo entiende Vite.
6. **Un cambio en un componente, un CSS o una fuente que use la vista previa obliga a volver a desplegar también el Studio** (`npm --prefix sanity-studio run deploy`). Si no, el editor ve una versión anterior del sitio.

## Por qué

Una imitación de los paneles en el Studio deriva en cuanto cambia el sitio, y el editor publicaría juzgando algo que no es lo que se verá. El precio es el acoplamiento entre los dos paquetes y tener que redesplegar el Studio; el usuario, que lo veía como deuda técnica, decidió aceptarlo como regla a cambio de que un check lo vigile.

## Qué se descartó

- Componentes y estilos propios del Studio que imitan el sitio.
- Incrustar la escena 3D o la edición sobre la web completa en el Studio.
- Tratar el acoplamiento como deuda a retirar.

## Se ha roto si…

- La vista previa no compila contra los componentes del sitio. Lo detecta `npm run check:studio` (`checks/studio-typecheck.mjs`): ejecuta el `typecheck` del Studio, cuyo `sanity-studio/tsconfig.json` incluye `components/**/*.tsx`, así que `tsc` sigue los imports de `DocumentPreview.tsx` hasta `src/` y un cambio de props en `CasePanel` o `ContactSection` lo rompe. **Solo con el Studio instalado:** sin `sanity-studio/node_modules/typescript` se salta con aviso y termina en verde, que es siempre el caso en Vercel.
- Desaparece o se renombra un CSS o una fuente que importa `previewStyles.ts`. `check:studio` no lo ve: `sanity-studio/components/assets.d.ts` declara cualquier `*?raw` y `*?url` como cadena, así que `tsc` no comprueba que el archivo exista. Falla `sanity build` o `sanity deploy`. Una fuente del CSS que falte en el mapa de `previewStyles.ts` no falla en ningún sitio: se sustituye por una cadena vacía.
- La conversión del borrador cambia de forma. Fija: `sanity-studio/tests/editorial.test.ts` («draft previews»), que `npm run check` no ejecuta.
- **Check pendiente:** una comprobación en la puerta de la raíz, que no dependa de los `node_modules` del Studio, que (1) resuelva cada import de `sanity-studio/components/` hacia `src/`, `content/` y `public/` y falle si el archivo no existe; (2) falle si una fuente que usa el CSS importado no está en el mapa de `previewStyles.ts`; y (3) avise, cuando cambie alguno de esos archivos, de que hay que volver a desplegar el Studio. Hoy nada de esto se comprueba, y `checks/architecture.ts` no mira `sanity-studio/` (no está en `ROOTS`).

## Afecta a

`sanity-studio/components/DocumentPreview.tsx`, `sanity-studio/components/LazyDocumentPreview.tsx`, `sanity-studio/components/previewModel.ts`, `sanity-studio/components/previewStyles.ts`, `sanity-studio/components/assets.d.ts`, `sanity-studio/sanity.config.ts`, `sanity-studio/tsconfig.json`, `checks/studio-typecheck.mjs`, y en el sitio: `src/components/CasePanel.tsx`, `src/components/LegalBlock.tsx`, `src/components/ContactSection.tsx`, `src/components/AuditSection.tsx`, `src/blog/PostBody.tsx`, `src/blog/BlogFigure.tsx`, los CSS que lista `previewStyles.ts` y `public/fonts/`
