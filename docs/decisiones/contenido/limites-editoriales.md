# Los límites editoriales se escriben una vez y se aplican en el Studio y en el build

**Estado:** vigente · **Desde:** 2026-09-05 (`63e34e8`, una tabla para cada límite); ampliada el 2026-09-19 (`853dc2d`, cada número compartido una vez; `b24a64e`, avisos antes de Publicar) · **Sustituye a:** ADR 011 («A field contract now exists in two places that must agree») y las menciones dispersas en los contratos de campos y de medios

El caso de las marcas subidas, con sus reglas concretas, está en [validación de marcas subidas](../earth/validacion-de-marcas-subidas.md). Aquí va la regla general para todos los demás campos.

## Decisión

1. **Cada límite con más de un consumidor se escribe una vez**, en `src/content/editorialBounds.ts` (`EDITORIAL_BOUNDS`, `ID_PATTERN`, `EMBED_HOSTS`…). Las listas cerradas de formas del campus están en `src/content/campusShapes.ts`. Los dos archivos no importan nada, porque el Studio los compila desde fuera de su paquete.
2. **Un límite con un solo consumidor se queda donde se aplica:** el techo de los campos SEO (`SEO_FIELD_MAX` en `content/collections/siteSeo.collection.ts`) solo en el build; los avisos de longitud SEO y de `shortTitle`, solo en el Studio.
3. **El build garantiza; el Studio avisa y bloquea antes.** El Studio desactiva «Publicar» con los mismos errores que rechazaría el build, y añade un nivel amarillo de avisos que deja publicar (`sanity-studio/schemas/lib/advice.ts`). El build vuelve a comprobarlo todo, porque una importación de dataset, una copia restaurada o la API HTTP no pasan por el Studio.
4. **Error es un hecho de maquetación; lo demás es consejo.** Se rechaza lo que el renderizador no puede mostrar bien (texto que se recorta, forma de imagen imposible); se aconseja lo que solo queda peor. Donde el límite se midió, el Studio avisa un poco antes con una constante `*Advised` en la misma tabla.
5. **Los mensajes del Studio dicen el límite, la causa y el siguiente paso**, en español y con las palabras del sitio.
6. **Se rechaza lo que sobra, nunca se recorta:** una frase cortada parece un fallo de renderizado, y quien puede arreglarla bien es quien la escribió.

## Por qué

Escritos dos veces, los límites derivan, y la deriva cae en quien despliega: si el Studio es más laxo, el editor publica algo que tumba el siguiente build. Varios despliegues del 2026-09-18 y 19 fallaron por decisiones editoriales que el Studio no señalaba.

## Qué se descartó

- Duplicar los números a propósito en los dos paquetes (la postura de ADR 011 y del contrato de medios hasta septiembre).
- Poner los límites en `src/content/invariants.ts`: importa tipos que el Studio no debe compilar.
- Recortar el texto largo en el mapper.

## Se ha roto si…

- Un esquema que acota algo no importa la tabla compartida. Fija: `content/collections/editorialBounds.test.ts` («every schema that bounds anything imports the shared table»).
- El build acepta o rechaza un valor en el límite de forma distinta a la tabla. Fija: `editorialBounds.test.ts` («accepts exactly…», «rejects…»).
- El Studio deja publicar lo que el build rechazaría. Fija: `sanity-studio/tests/editorial.test.ts`, que `npm run check` no ejecuta (`npm --prefix sanity-studio test`).
- `editorialBounds.ts` o `campusShapes.ts` ganan un `import`. Lo dicen sus comentarios; ningún test lo comprueba.
- Se relaja un límite medido sin volver a medir el hueco (revisión humana).

## Afecta a

`src/content/editorialBounds.ts`, `src/content/campusShapes.ts`, `src/content/invariants.ts`, `content/collections/*.collection.ts`, `content/collections/serviceBounds.ts`, `sanity-studio/schemas/**`, `sanity-studio/schemas/lib/editorChecks.ts`, `sanity-studio/schemas/lib/advice.ts`, `sanity-studio/tests/editorial.test.ts`
