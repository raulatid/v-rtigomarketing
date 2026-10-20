# En `public/` solo está lo vigente, y lo que cambia cambia de nombre

**Estado:** vigente · **Desde:** 2026-09-19 (`2e6c2db`: `public/` por lista de permitidos); entregas superadas de la ciudad fuera de `public/` desde el 2026-10-08 (`64fc538`); lo retirado vive solo en git desde el 2026-10-20 (`49f14c8`) · **Sustituye a:** ARCHITECTURE «Publication policy and asset delivery» (tercer párrafo) y §19 (las dos últimas frases)

## Decisión

1. **Se publica de `public/` solo lo que acepta `isPublicAsset`** (`scripts/publicationHygiene.ts`):
   - las carpetas de `PUBLIC_ROOTS` con las extensiones de `PUBLIC_EXTENSIONS`;
   - los archivos de la raíz de `PUBLIC_ROOT_FILES`;
   - `media/site` y `media/tower`, con sus formatos (ver [medios replicados](../contenido/medios-replicados.md)).

   Nunca nada oculto ni con prefijo `sky-test-`. Cómo se emite y se verifica la salida es de [salida verificada](salida-verificada.md).
2. **En `public/` solo está la entrega vigente.** Lo que se retira se borra del árbol y queda en el historial de git. No hay carpeta de archivo en `design/` ni copias «para volver atrás»: volver atrás es un `git revert`.
3. **Un recurso que cambia de contenido cambia de nombre.** `public/` no lleva hash y `vercel.json` lo cachea (ver [despliegue en Vercel](despliegue-en-vercel.md)). Por eso:
   - la ciudad lleva la versión en el nombre del GLB y en el de su carpeta de lightmaps (ver [entrega de la ciudad](entrega-de-la-ciudad.md));
   - la música y las fuentes llevan el hash del contenido en el nombre (la receta de `CREDITS.md` es la de la música; la de las fuentes no está escrita);
   - un recurso sin versión en el nombre (Tierra, cielo, satélite, marca) no se sustituye en el mismo sitio sin aceptar que tardará en verse.
4. **Las rutas de los recursos y de los decodificadores van desde la raíz** (`/models/…`, `/draco/`, `/libs/basis/`). Una ruta relativa al documento da 404 en cualquier ruta que no sea `/`.
5. **Los metadatos de los binarios se revisan como texto:** el bloque JSON de cada GLB y los pares clave/valor de cada KTX2 (`assetMetadata`). Una ruta del disco local en ellos para el build. Se limpia en origen.
6. **`textures/murcia/tower/global-earth-network-connections-001.webp` se queda.** Lo nombran `content/fixtures/towerScreen.json` y `content/seed/towerScreen.json`, así que lo cargan los builds con contenido de prueba (decisión del usuario, 2026-10-20).

## Por qué

- Cada despliegue publicaba seis GLB y seis carpetas de lightmaps que nada leía, más de dos tercios de `dist/` (`64fc538`).
- Con la copia entera, cualquier archivo que cayera en `public/` se convertía en una URL. La copia por defecto de Vite, además, ignora `.gitignore` (comentario de `publicationHygiene` en `vite.config.ts`).
- Dos políticas de retirada a la vez (`design/murcia/archive/` y «solo en git») se contradecían. Quedó la de git (decisión del usuario, 2026-10-20).
- Sustituir un archivo sin renombrarlo parece un despliegue fallido: el navegador y la CDN siguen sirviendo los bytes viejos.

## Qué se descartó

- La copia por defecto de `public/`.
- Conservar las entregas anteriores en `public/` o en `design/murcia/archive/`.
- Acortar la caché de `public/` en lugar de versionar los nombres.
- Sacar de `public/` el webp de la torre: se planeó y se canceló, porque lo leen los builds con fixtures.

## Se ha roto si…

- Falla `scripts/publicationHygiene.test.ts` («publishes runtime assets but excludes prototypes, hidden files and source files», los casos de `media/site` y `media/tower`, «inspects GLB metadata…», «checks the KTX2 key/value section…»).
- El build termina con `[publication]` y `local filesystem path` en un GLB o un KTX2.
- Un recurso nuevo funciona en `npm run dev` y da 404 en producción: el servidor de desarrollo sirve `public/` entero. Sin test.
- Tras desplegar, un recurso sustituido sigue mostrando la versión anterior. Sin test.
- Vuelve a aparecer en el árbol una entrega o un GLB retirado. Sin test.

## Afecta a

`scripts/publicationHygiene.ts`, `scripts/publicationHygiene.test.ts`, `vite.config.ts` (`publicationHygiene`, `copyPublicDir`), `vercel.json` (`headers`), `public/`, `src/graphics/decoders.ts` (`DRACO_PATH`, `BASIS_PATH`), `src/experiences/murcia/config/murciaConfig.ts` (`modelPath`), `CREDITS.md`
