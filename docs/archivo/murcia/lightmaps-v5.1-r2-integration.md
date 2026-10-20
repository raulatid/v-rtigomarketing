# Murcia v5.1 — revisión 2

Se ha sustituido la ciudad activa por la exportación del Blender actualizado, con cinco bancos y cinco macetas menos. Los 15 atlas se han vuelto a hornear a 512 muestras para actualizar también las sombras. La entrega y los archivos de la revisión anterior se conservan.

## Archivos activos

- Modelo: `public/models/murcia-v5.1-lightmaps-r2.glb` (5,793,276 bytes).
- Lightmaps: `public/textures/murcia/lightmaps-v5.1-r2/`.
- Móvil: 15 atlas de 1024 px, **1,993,562 bytes** en total, límite 2 MB.
- Desktop: 15 atlas de 2048 px, **3,982,348 bytes** en total, límite 4 MB.
- Fuente SHA-256: `d2eb014a165a19ebcf40a0049508ac780fde8e21a2735fbbd2f3b28fc8eea5d5`.

El GLB se contabiliza por separado. Las rutas nuevas evitan reutilizar por caché los mapas anteriores. Se mantiene el cargador de la primera integración v5.1, incluida la base transparente de Vértigo. Se conserva la decisión de usar la exportación sin la reparación antigua del techo del estadio.

## Comprobaciones

- El Blender original sigue intacto; los mapas y el Blender final se guardan en una carpeta de revisión independiente.
- Las 6047 instancias exportadas coinciden con las transformaciones de la escena actual; las diez eliminadas no aparecen en el GLB.
- Los 32 archivos web coinciden por SHA-256 con la nueva entrega.
- TypeScript, pruebas de lightmaps/materiales y contrato completo del GLB: correctos.
- Visor de desarrollo en Edge: móvil 1K y desktop 2K solicitan los 15 atlas correspondientes, sin errores de consola. Los 234 receptores conservan el material esperado; funcionan la V animada, Servicios, Blog y el regreso desde Blog. La base de Vértigo conserva opacidad y rugosidad 0,24.
- El perfil móvil se ha comprobado mediante emulación; no es una prueba en teléfono físico.

La compilación de producción sigue bloqueada por el presupuesto de JavaScript ya excedido antes de estas integraciones. Resultado actual: initial JS for / is 1623581B over 11 requests, past the 1612000B budget by 11581B.. El presupuesto no se ha aumentado ni desactivado. La línea base anterior era 1.623.257 bytes frente al límite de 1.612.000 bytes; véase la primera integración v5.1. La verificación visual se ha realizado en desarrollo.

## Fuentes y evidencia

- Entrega: `04_Assets/3D-assets/ciudad-de-murcia/murcia-v5.1-lightmaps-r2/`; consultar `LEEME.md`, `revision-changes.json`, `delivery-verification.json` y `qa/instance-removal-verification.json`.
- Integración: `.integration-v5.1-r2/` en ese mismo espacio de assets; contiene `asset-integrity.json`, `integration-verification.json`, registros y capturas del navegador.
- [Integración anterior y límite de compilación](lightmaps-v5.1-integration.md).
