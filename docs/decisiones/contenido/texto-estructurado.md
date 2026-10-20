# El texto estructurado son bloques tipados, no HTML

**Estado:** vigente · **Desde:** 2026-08-23 (`76a21e9`, ADR 011); bloques vacíos descartados desde 2026-09-19 (`14de364`) · **Sustituye a:** DECISIONS §31 («Structured content is typed blocks…») y ADR 011 en lo mismo; fila «Legal copy is `string[]`» de la tabla «Superseded»

## Decisión

1. **Los textos legales y los del blog se guardan como Portable Text** y en la ingesta se convierten al vocabulario de `src/content/types.ts` (`richBlocks` en `content/lib/portableText.ts`).
2. **Lo desconocido hace fallar el build; nunca se descarta.** Un estilo, marca, anotación o tipo de bloque fuera del vocabulario es un error con ruta. La única excepción es un bloque **vacío** (una línea en blanco), que se descarta como separador; un cuerpo hecho solo de líneas en blanco sigue fallando.
3. **Los enlaces solo pueden ser `https:` o `mailto:`**, comprobado analizando la URL, no con un patrón.
4. **Ningún renderizador inyecta marcado.** `LegalBlock`, `PostBody` y `textSpans` eligen un elemento por tipo; no hay `dangerouslySetInnerHTML` ni bloque de HTML crudo.
5. **El texto plano se limpia quitando etiquetas antes de decodificar entidades** (`stripHtml` en `content/lib/html.ts`). Un `<` que no abre una etiqueta es texto y se conserva.
6. **Ampliar el vocabulario es un cambio de código** en tres sitios a la vez: `portableText.ts`, el esquema del Studio y el renderizador.

Lo propio del blog (citas, imágenes, embeds) es del área del blog.

## Por qué

Un aviso legal sin títulos, listas ni enlaces no sirve, y `string[]` no los permite. Descartar un bloque desconocido publicaría un documento legal sin una cláusula que el editor cree haber escrito: es el peor resultado posible. Los bloques vacíos, en cambio, tumbaban despliegues por una pulsación de Intro que el Studio no muestra.

## Qué se descartó

- `body: string[]` para legal y blog.
- Guardar o renderizar HTML del CMS.
- Descartar en silencio lo desconocido.

## Se ha roto si…

- Un documento legal se publica sin una cláusula, o un título sale como párrafo. Fija: `content/lib/portableText.test.ts` («a block style outside the vocabulary», «a mark nobody implements», «drops an empty block as a blank line…»).
- Aparece `dangerouslySetInnerHTML` en un renderizador de contenido (hoy solo aparece en comentarios que lo prohíben; ningún test lo busca).
- «precio <5%» se publica como «precio 5%». Fija: `content/lib/html.test.ts` («keeps a bracket that is prose, not a tag»).

## Afecta a

`content/lib/portableText.ts`, `content/lib/html.ts`, `content/collections/legalDocs.collection.ts`, `content/collections/blogPosts.collection.ts`, `src/content/types.ts`, `src/components/LegalBlock.tsx`, `src/components/textSpans.tsx`, `src/blog/PostBody.tsx`, `sanity-studio/schemas/lib/legalBody.ts`, `sanity-studio/schemas/objects/richText.ts`
