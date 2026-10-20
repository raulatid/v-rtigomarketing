# Documentación de vgc

Índice de las decisiones vigentes. Si vas a cambiar algo de un área, lee antes su decisión y su archivo de trampas.

## Reglas de esta documentación

1. **Idioma:** la documentación vigente se escribe en español. El código, los identificadores, los nombres de archivos de código y los mensajes de commit siguen en inglés. Lo archivado se queda en su idioma original.
2. **Una decisión por archivo, siempre en estado actual.** Si una decisión cambia, se reescribe; la versión anterior queda en git o en `archivo/`. No se acumulan enmiendas.
3. **Los números no se copian, se enlazan.** Se cita la constante y su archivo («`CAMERA_DISTANCE` en `murciaConfig.ts`»), no su valor. El porqué de cada cifra vive en el comentario junto a la constante.
4. **Campos de una decisión:** estado, desde cuándo y a qué sustituye; decisión; por qué; qué se descartó; se ha roto si…; afecta a (rutas).
5. **Las trampas** (errores conocidos y comportamientos que parecen bugs pero son intencionados) van en `trampas/`, agrupadas por área.

## Migración en curso

La documentación anterior (`DECISIONS.md`, `PROJECT_MEMORY.md`, `ARCHITECTURE.md`, `ENGINEERING_PRINCIPLES.md`, `adr/`) se está migrando por áreas. Una entrada antigua marcada como **Migrada** es historia: la fuente válida es el archivo nuevo al que apunta. Lo que aún no está migrado sigue en su sitio y puede estar desfasado.

| Área | Estado |
|---|---|
| Cámara y navegación de Murcia | migrada |
| Transición / warp | migrada |
| Earth | pendiente |
| Contenido / CMS | pendiente |
| Build y presupuestos | pendiente |

## Decisiones

### Navegación entre mundos
- [Banda de zoom y commit](decisiones/navegacion/banda-de-zoom-y-commit.md): ambos mundos comparten banda; la rueda hace commit al final, el dedo con un pellizco nuevo desde el final; dos dedos solo son pellizco.

### Transición y warp
- [Ciclo de vida](decisiones/transicion/ciclo-de-vida.md): ambos mundos siempre montados; desactivar es congelar. Earth vuelve a la vista general.
- [Precarga de Murcia](decisiones/transicion/precarga-de-murcia.md): bytes durante la apertura, construcción y precalentado en `site`.
- [Corte bajo destello](decisiones/transicion/corte-bajo-destello.md): nada hace fundido cruzado; el corte cae bajo el pico del destello.
- [Warp](decisiones/transicion/warp.md): un progreso y tres curvas; cada mundo mueve su cámara; salir de Murcia es subir.
- [Giro de Earth hacia España](decisiones/transicion/giro-de-earth-hacia-espana.md): fase fija después del commit.
- [Vacío](decisiones/transicion/vacio.md): pase de pantalla al salir de Murcia, nunca un aumento de FOV.
- [Música](decisiones/transicion/musica.md): la música hace fundido cruzado; la imagen no.

### Murcia
- [Pose de reposo](decisiones/murcia/pose-de-reposo.md): todos los hitos en plano al aterrizar.
- [Modelo de entrada](decisiones/murcia/modelo-de-entrada.md): un puntero mueve giro y avance; el mundo sigue al dedo; ganancia e inercia propias para el dedo.
- [Sensación de cámara](decisiones/murcia/sensacion-de-camara.md): muelles que aterrizan, zoom críticamente amortiguado, inclinación hacia el cursor.
- [Límites de la cámara](decisiones/murcia/limites-de-camara.md): solo se limita el objetivo, al anillo A2; `check:footprint` es la garantía.
- [Brújula](decisiones/murcia/brujula.md): rumbos en el suelo, blanca, sobre la cabecera, no es un control.
- [Edificios interactivos](decisiones/murcia/edificios-interactivos.md): parpadeo y geotags.

## Trampas

- [Cámara y navegación de Murcia](trampas/murcia-camara.md)
- [Transición y warp](trampas/transicion.md)

## Contratos

- [Campos de Sanity](content/sanity-field-contract.md)
- [Medios de Sanity](content/sanity-media-contract.md)
- [Exportación desde Blender](murcia/blender-export-contract.md)
