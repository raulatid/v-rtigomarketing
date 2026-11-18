# Peso del proyecto: de 12,44 a 9,83 MB

**Fecha:** 2026-11-18. **Base:** `91182a6` (entrega v5.2-r4, música AAC, favicon a 512), con los cambios de esta pasada sin commit. Continúa el [informe del 2026-11-17](project-resource-budget-2026-11-17.md), que proponía el método y el reparto. Desde aquel informe ya se habían aplicado los lightmaps a 1024, las nubes a 2048, el favicon a 512 y la música en AAC; esta pasada parte de ahí.

**Etiquetas:** medido = archivos o navegador de esta pasada; estimado = sin medir. MB = 1.000.000 bytes.

## Cómo se mide

- **Build:** producción local (`VITE_VERCEL_ENV=production npx vite build`), servida con `vite preview`.
- **Navegador:** Chrome con Playwright, un contexto nuevo por escenario y caché fría.
- **Escenarios:**
  - visita completa de escritorio a 1600×900: 25 s en la Tierra, rechazar cookies (el gesto desbloquea la música), viajar a Murcia con `.nav-control` y esperar 20 s;
  - escritorio sin viajar, durante 40 s;
  - móvil emulado (Pixel 7), durante 40 s.
- **Qué se suma:** `decodedBodySize` de todas las entradas `resource`, es decir, el contador «resources» de DevTools. No incluye el HTML principal (5.413 B).
- **Herramientas:** el script de medición y el de capturas viven fuera del repositorio.

| Escenario | Antes | Después | Diferencia |
|---|---:|---:|---:|
| Visita completa, escritorio, con música | 12,440 MB | **9,830 MB** | −2,610 MB (−21,0 %) |
| Escritorio sin viajar | — | 9,400 MB | — |
| Móvil emulado sin viajar | — | 8,593 MB | — |

Ningún escenario dio `pageerror`. Antes había 80 entradas en la visita completa y después 78: Draco ya no se pide dos veces.

## Reparto de la visita completa (medido)

| Bloque | Antes | Después |
|---|---:|---:|
| GLB de Murcia | 3,674 | 2,616 |
| Lightmaps (20 KTX2) | 1,837 | 1,837 |
| JS y CSS | 1,583 | 1,544 |
| Audio (música y efectos) | 1,182 | 1,182 |
| Texturas de la Tierra | 1,186 | 0,979 |
| Decodificadores | 1,087 | 0,836 |
| Imágenes (marcas, torre, favicon, cielo) | 1,107 | 0,366 |
| Otros modelos (satélite, vehículos, isotipo) | 0,486 | 0,197 |
| Otros (textura del satélite, manifiestos) | 0,180 | 0,156 |
| Fuentes | 0,116 | 0,116 |

## Qué se aplicó

Cada cambio se revisó en la escena o con una métrica contra el original o el máster. Ninguno baja la calidad que se ve.

1. **GLB de la ciudad, entrega v5.2-r5: −1.058.088 B.**
   - Instancias en enteros normalizados y sin escalas unitarias.
   - Draco con los bits justos por primitiva: paso de posición ≤ 4,8 mm y error de UV de lightmap ≤ 1/16 de téxel; las juntas se quedan en 18 bits.
   - Sin cambios de código en el runtime.
   - Detalle, tolerancias medidas y capturas: [registro de r5](../../murcia/lightmaps-v5.2-r5-integration.md).
2. **Marcas y pantalla de la torre en WebP q90: −741.064 B.**
   - `MediaRule.deliver` pide a la CDN de Sanity `fm=webp&q=90` junto con el ajuste de tamaño.
   - Las diez marcas pasan de 546 KB a 205 KB y la imagen de la torre de 428 KB a 29 KB.
   - El alfa se conserva exacto. Solo una marca que ya era PNG paletizada crece 2 KB.
   - La comparación lado a lado a 3–4× no muestra diferencias al tamaño en que se dibujan.
   - Ver [medios replicados](../../decisiones/contenido/medios-replicados.md).
3. **Draco se descarga una vez por documento: −250.876 B** contados.
   - `SharedDracoLoader` guarda la biblioteca en el módulo, y los grupos de workers se siguen liberando.
   - La segunda petición venía de la caché HTTP, pero contaba y se analizaba otra vez.
   - Ver [decodificadores compartidos](../../decisiones/render/decodificadores-compartidos.md).
4. **Nubes con el mip llevado a ≥ 120: −207.512 B.**
   - Lo que queda por debajo del umbral del shader se dibuja igual, y ETC1S deja de gastar bits ahí.
   - Contra el máster, después del umbral, queda más cerca que el archivo anterior en todos los niveles (L0: 28,9 frente a 26,8 dB).
5. **Vehículos en Draco: −189.084 B** (seis archivos, de 209.004 a 19.920 B).
   - Todos los triángulos casan con el original; la máscara `_TONE` es exacta.
   - El test los decodifica en Node.
6. **Satélite: −120.939 B.**
   - GLB recodificado con el codificador de three: −97.180 B; todos los triángulos casan.
   - Textura sin el canal alfa, que valía 255 dentro de las islas: −23.759 B, con 30,71 frente a 30,52 dB contra el máster dentro de las islas.
7. **Decodificador Zstd fuera del build: −39.479 B** del chunk de three.
   - Solo lo usaría un KTX2 de formato crudo con Zstd, y todos los publicados son Basis.
   - Lo protegen dos guardas: una en el build y otra en la higiene de publicación.
   - Ver [compresión y decodificadores](../../decisiones/build/compresion-y-decodificadores.md), punto 6.
8. **Isotipo 3D recodificado: −2.360 B.**

**Recetas:** las de los puntos 4 a 8 se reproducen byte a byte desde `04_Assets/optimizados/recodificacion-2026-11-18/`, junto a los másteres, y la del punto 1 desde `murcia-v5.2-web-r5/`, junto a la escena. Las dos carpetas están fuera del repositorio, como exige la [decisión de compresión](../../decisiones/build/compresion-y-decodificadores.md).

**Publicación sin renombrar:** los archivos de la Tierra, del satélite, de los vehículos y del isotipo se sustituyeron con el mismo nombre. Según [recursos publicados](../../decisiones/build/recursos-publicados.md), punto 3, una caché puede servir los bytes viejos durante un tiempo. Son equivalentes a la vista, así que no se mezcla nada que se note.

## Qué se midió y no se aplicó

| Opción | Ahorro | Por qué no |
|---|---:|---|
| Día y noche de la Tierra a ETC1S q64 | ~136 KB | La pérdida es medible: día 30,18 frente a 30,70 dB, noche 35,80 frente a 37,30 dB, más bloques alrededor de las luces. |
| Día y noche a 2048 | ~472 KB | Se ven más blandos en el primer plano del satélite con DPR 2. |
| Noche en un canal | — | Tiene color de verdad; 38,7 dB y cambiaría el color de las luces. |
| GLB con Draco a velocidad 0 | ~50 KB | Decodificar sale un 42 % más lento. |
| Rotación int8 en las instancias | ~90 KB | 0,55° de error y un 1 % de escala. |
| UV de lightmap a 12 bits | ~86 KB | 1/8 de téxel; no se revisó. |
| `build.target` es2022 | ~10 KB | Safari ≤ 14 y Chromium < 91 recibirían un error de sintaxis y perderían el aviso de «sin WebGL 2». Es una decisión de soporte. |
| terser en lugar de esbuild | ~7 KB | Una dependencia nueva y un build siete veces más lento. |
| Favicon a 256 px | ~24 KB | Contradice la nota de `faviconMinSide` sobre el icono de instalación de 512. |

## Lo que queda abierto

Estas propuestas necesitan una decisión del usuario o una entrega nueva. Ninguna está aplicada.

- **Música (1,10 MB, el 11 % de la visita completa).**
  - Ya va en AAC-LC a 80 kbps, no hay máster sin pérdida y el estéreo es real: el canal lateral está a unos 10–13 dB del central.
  - Bajar el bitrate o pasarla a mono se oiría.
  - Lo que sí ahorraría sin perder calidad es un bucle más corto bien cerrado. Es una decisión creativa.
  - Solo se descarga si el visitante deja el sonido activo.
- **Lightmaps (1,84 MB).**
  - Todos son ETC1S a 1024 con un nivel.
  - Bajar a 512 los atlas de fondo (`outer-*`, `instances-outer-*`) ahorraría del orden de 250 KB (estimado).
  - Hay que codificarlo desde los másteres de r1 y que el usuario lo revise en la escena, como se hizo con r4.
- **Geometría de fondo.**
  - `CITY_B/C/D_SIMPLIFIED` y las 21.897 ventanas instanciadas siguen siendo el grueso del GLB.
  - Reducirlo es una entrega de Blender: volúmenes de silueta y color de luz por instancia (informe del 2026-11-17, §1 y §2).
- **JS.**
  - Cargar en diferido los diálogos de auditoría y contacto, que están montados aunque estén cerrados, ahorraría unos 40 KB (estimado) en la visita que no los abre.
  - El resto es React (~185 KB), R3F (~148 KB) y three (~650 KB), que no se reducen sin cambiar de librería.
- **Basis (585 KB).** El transcodificador tiene que ser la copia exacta del de three ([compresión y decodificadores](../../decisiones/build/compresion-y-decodificadores.md), punto 3).

## Hallazgos de paso, sin corregir

- **Espacio de color de las nubes.** Todos los archivos de nubes están marcados como sRGB, aunque los comentarios de `earthConfig.ts` y del shader dicen «lineal». La GPU decodifica antes del umbral, así que solo se ven los valores de sRGB ≈ 188 o más. El aspecto actual es el aprobado, pero el comentario no describe el archivo.
- **Calidad de día y noche.** El commit `00897d9` dice que día y noche son q180, y la cabecera de los archivos dice `--qlevel 128`.
- **Workers de Basis.** `EarthScene` retiene su referencia de KTX2 hasta desmontarse, así que los workers de Basis probablemente siguen vivos cuando la ciudad ya está lista. Es lo leído en el código, sin medir, y la [decisión de decodificadores](../../decisiones/render/decodificadores-compartidos.md) lo lista en «Se ha roto si…».
- **Favicon pedido dos veces.** Chrome vuelve a pedir el favicon al empezar a sonar el audio, para el icono de los controles multimedia. Se reproduce en una página que solo tiene un `<audio>`, así que no es un fallo del sitio. En producción sale de la caché.
- **Medios retirados en local.** Los PNG de marcas que ya no se usan siguen en la carpeta replicada local de un build anterior y se publicarían desde un build local. En Vercel la carpeta empieza vacía.

## Comprobaciones de esta pasada

Las comprobaciones de la cadena están en el registro del commit. En la escena se revisó:

- la llegada a Murcia y el acercamiento máximo sobre la torre y la catedral, con r4 frente a r5 y con r5 frente a una variante;
- una pasada de control con dos capturas del mismo build;
- la Tierra con los archivos viejos y los nuevos servidos al mismo build, interceptando la red: el globo de cerca y un satélite.

No se probó en un Android ni en un iOS reales.
