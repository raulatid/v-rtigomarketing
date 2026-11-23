# Peso del proyecto en transferencia: de 7,78 a 6,33 MB

**Fecha:** 2026-11-23. **Base:** `fd36f6b` (entrega v8), medida el 2026-11-22. **Después:** `cfb12e0` (`murcia-traffic` con las ramas de accesibilidad y de peso integradas), con el contenido real de Sanity. Continúa el [informe del 2026-11-18](project-resource-budget-2026-11-18.md), que medía «resources»; desde esta pasada la cifra es la **transferencia**.

**Etiquetas:** medido = navegador de esta pasada; estimado = calculado sin servir desde Vercel. MB = 1.000.000 bytes.

## Cómo se mide

- **Script:** `scripts/measure-transfer.mjs` (`node scripts/measure-transfer.mjs --runs 2`), sobre un `dist/` de producción (`VITE_VERCEL_ENV=production` en el shell). Arranca su propio `vite preview`.
- **Escenario:** visita completa de escritorio con caché fría: la Tierra, el viaje a Murcia con `.nav-control` (confirmado por su etiqueta) y la estancia en la ciudad.
- **Qué se suma:** `transferSize` de todas las entradas.
- **Estimación de Vercel:** `vite preview` comprime solo con gzip, y solo el texto; Vercel comprime con Brotli html, js, css, json, svg, wasm, ttf/otf e ico. La estimación sustituye cada archivo de esos tipos por su tamaño en Brotli q11. Con la calidad que use de verdad Vercel (no documentada), el texto pesaría unos 0,07 MB más.

| | Antes | Después | Diferencia |
|---|---:|---:|---:|
| Estimado en Vercel | 7,776 MB | **6,333 MB** | −1,443 MB (−18,6 %) |
| Medido en `vite preview` | 8,319 MB | 6,878 MB | −1,441 MB |
| Entradas | 78 | 67 | −11 |

Dos pasadas idénticas en cada caso y ningún `pageerror`.

## Reparto (estimado en Vercel, MB)

| Grupo | Antes | Después |
|---|---:|---:|
| GLB de Murcia | 1,984 | 1,939 |
| Lightmaps de Murcia | 2,062 (21) | 1,468 (16) |
| Audio | 1,184 | 1,184 |
| Texturas de la Tierra | 0,980 | 0,456 |
| Imágenes | 0,443 | 0,308 |
| JS y CSS | 0,425 | 0,433 |
| Decodificadores | 0,253 | 0,253 |
| Otros modelos | 0,199 | 0,089 |
| Otros | 0,128 | 0,128 |
| Fuentes | 0,117 | 0,074 |

## Qué se aplicó

- **Murcia v9** (`9782348`): ventanas y pretiles de tejado sin celdas de atlas, que heredan la luz de su pared o su tejado ([entrega de la ciudad](../../decisiones/build/entrega-de-la-ciudad.md)). Es la mayor parte de lo que bajan el GLB y los lightmaps. Sin los props de tejado nuevos, que llegarán con otra pasada de la cadena.
- **Día y noche de la Tierra en AVIF en escritorio** (`7100284`): −524.220 B en la visita de escritorio. La tableta y el móvil siguen en KTX2. A cambio, más memoria de GPU ([convenciones de render](../../decisiones/earth/convenciones-de-render.md)).
- **Logos de marca bajo demanda** (`8013dc0`): −134.220 B en una visita que no selecciona nada.
- **Satélite simplificado** (`37276bb`): −110.064 B, y de 90 a 6 llamadas de dibujo.
- **Switzer retirada** (`ca8bc71`): −43.220 B en `/` y en `/blog`.
- **Nubes del móvil** (`7689f6b`): −57.330 B, solo en el móvil; no entra en esta cifra de escritorio.

## Qué queda abierto

- **La música de Murcia** (0,43 MB): acortar el bucle es una decisión del usuario.
- **Los diálogos de auditoría y contacto en diferido**: cortados en esta pasada para no chocar con los cambios de accesibilidad en los mismos componentes.
- **El transcodificador Basis recortado, Murcia por intención y la música en Opus**: no se intentaron.
- **El JS inicial ya no tiene margen:** la entrada de la app queda a 18 B de su techo secundario de 60.000 B ([JS inicial de la portada](../../decisiones/build/js-inicial-de-la-portada.md)).
