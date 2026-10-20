# Historial del blog y salida al resto del sitio

**Estado:** vigente · **Desde:** 2026-08-31 (`950edce`, ADR 013) · **Sustituye a:** ADR 013 §3

## Decisión

1. **El blog nunca deduce en qué documento está.** El anfitrión le pasa `exitToScene()` en `BlogHost` (`BlogRoute.tsx`):
   - en caliente, `App.handleExitBlog` deshace el historial hasta la escena (`exitToSceneByHistory`) y, si no hay entrada a la que volver, va a `/` con una navegación real;
   - en frío, `BlogApp` (`entries/blog.tsx`) hace `location.assign('/')`.
2. **Tres operaciones distintas** (`src/app/useRoute.ts`):
   - `openPost`: índice → artículo, con `pushState`. La entrada guarda a cuántos pasos queda el índice (`indexDelta`).
   - `returnToIndex`: artículo → índice, con `history.go(-pasos)`. **Deshace** hasta la entrada original del índice, con su URL, su filtro y su scroll, y deja la profundidad del historial donde estaba. Si se llegó al artículo por un enlace directo y no hay índice detrás, **reemplaza** en vez de empujar.
   - `exitToScene`: la única forma de salir del blog.
3. **El estado del historial va dentro de `vertigo`** (`src/app/blogHistory.ts`) y se valida campo a campo al leerlo. Si algo no encaja, se trata como «no hay historial del blog», que se degrada a reemplazar en vez de deshacer.
4. **El filtro de tema forma parte de la URL (`?tema=`, `TOPIC_PARAM` en `route.ts`); el texto de búsqueda no.** `route.ts` solo valida la forma. Si el tema está bien formado pero no existe, se ignora y la URL se corrige con `replaceState` desde el chunk del blog.
5. **`history.scrollRestoration` pasa a `'manual'` mientras el blog está abierto** y vuelve a su valor anterior al salir (`useRoute.ts`).
6. **Al llegar a una página, el foco va al encabezado** (`[tabindex="-1"]`), o al buscador si se llegó desde el control de búsqueda del artículo.
7. **El documento frío pinta el índice aunque la URL no se lea como blog** (por ejemplo, `/blog.html`): ese documento solo puede ser el blog.

## Por qué

Tratar artículo → índice como un `push` produce `Murcia → /blog → /blog/artículo → /blog`, y la salida cae en el artículo: el lector no puede salir y pierde el scroll del índice. La profundidad del historial no identifica el documento; quién es el anfitrión, sí.

## Qué se descartó

- Leer `history.state` o la profundidad del historial para decidir si el blog es frío o caliente.
- Guardar en la URL el texto de búsqueda: con cada tecla, el botón Atrás deja de servir.
- Guardar en el historial la intención de «abrir el buscador»: es una intención, no un lugar (`searchIntent` en `BlogRoute.tsx`).

## Se ha roto si…

- Fallan `src/app/blogHistory.test.ts` o `src/app/route.test.ts`.
- En `e2e/blog.spec.ts`, la segunda pulsación de `.blog-back` desde un artículo cae en el artículo y no en la escena, o `history.scrollRestoration` no recupera su valor al salir.

## Afecta a

`src/blog/BlogRoute.tsx` (`BlogHost`), `src/app/blogHistory.ts`, `src/app/route.ts`, `src/app/useRoute.ts`, `src/App.tsx` (`handleExitBlog`), `src/entries/blog.tsx` (`BlogApp`)
