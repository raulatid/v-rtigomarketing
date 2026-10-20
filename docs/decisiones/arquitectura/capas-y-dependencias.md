# Capas y reglas de dependencias

**Estado:** vigente · **Desde:** 2026-08-07 (`adc5c6e`, las capas); comprobadas sobre el grafo de imports desde el 2026-08-14 (`9735d53`); `src/content/` como hoja desde el 2026-08-20 (`42e3956`); `server/` y `api/` desde el 2026-09-04 (`84e1b28`); el pipeline `content/` desde el 2026-09-05 (`63e34e8`); experiencias sin `src/app/` y `platform/` desde el 2026-09-15 (`e8852ea`) · **Sustituye a:** ARCHITECTURE §3, §6 (que Earth y Murcia no se conozcan) y §17; la última línea del mapa de propiedad de la cabecera; los invariantes de dependencias de §29

## Decisión

1. **Tres capas, y los imports solo bajan:** aplicación (`src/App.tsx`, `src/app/`, `src/components/`) → experiencias (`src/experiences/earth/`, `src/experiences/murcia/`) → infraestructura compartida (`graphics/`, `interaction/`, `loading/`, `platform/`, `utils/`, `content/`, todas bajo `src/`). La infraestructura no importa experiencias ni `src/app/`. Las experiencias no importan `src/app/`.
2. **Earth y Murcia no se importan entre sí.** Lo que necesitan las dos va en la infraestructura; lo que pasa de una a otra pasa por la aplicación (ver [frontera de cada experiencia](frontera-de-cada-experiencia.md)).
3. **`src/content/` es una hoja:** tipos, invariantes y colecciones generadas. No importa experiencias, aplicación, graphics ni builtins de Node, porque también se empaqueta para Node. El pipeline `content/` importa `src/content/` y nada del navegador importa `content/` (ver [generado en build](../contenido/generado-en-build.md)).
4. **El logo de esquina (`corner-logo/`) y el blog (`blog/`) son interfaz de la aplicación:** no importan experiencias, y ninguna experiencia importa el blog.
5. **Fronteras de ejecución:**
   - el navegador no importa `server/` ni `api/`; `server/` solo lee `src/content/`; `api/` solo llega a `server/` (ver [backend de los formularios](../formularios/backend-de-formularios.md));
   - ningún módulo de `src/` importa un builtin de Node;
   - `src/intro-draw/` no importa nada de fuera de sí mismo (ver [arranque sin dependencias](../intro/arranque-sin-dependencias.md)).
6. **Las fronteras de documento y de carga son reglas de alcance desde una entrada, no de directorio:** qué no alcanza `src/main.tsx` de forma estática, y qué no alcanzan nunca `src/entries/blog.tsx` y `src/entries/not-found.tsx`. Ver [segundo documento](../blog/segundo-documento.md), [JS inicial de la portada](../build/js-inicial-de-la-portada.md) y [textos legales](../privacidad/textos-legales.md).
7. **El grafo de módulos es acíclico.**
8. **La lista de reglas es `checks/architecture.ts`, no este archivo.** Cada regla lleva allí su motivo. Añadir una es barato; quitar una es cambiar esta decisión.
9. **Una regla que solo dice «no» tiene al lado una guarda que exige que lo vigilado exista** (sección 5 del check): que el recorrido encuentre módulos e imports, que recorra `server/` y `content/`, que las costuras dinámicas sigan ahí y que exista la arista `SceneCanvas → RenderPipeline`. Un directorio sin recorrer se parece mucho a uno sin infractores.

El grafo dice la dirección de cada import, no en qué chunk cae: eso está en [trampas de build](../../trampas/build.md), n.º 7.

## Por qué

- Dos reglas escritas ya estaban rotas cuando se escribió el check: `graphics → murcia` durante varias fases (`RenderPipeline` importaba `MurciaExperience`) y `corner-logo → earth`. Las dos se encontraron leyendo, no porque fallara algo. Una regla que solo vive en un documento es una regla que el código acaba saltándose.
- El check lee el código fuente y no el bundle, para nombrar el archivo y el especificador culpables en lugar de un chunk que creció (cabecera de `checks/architecture.ts`).
- El contenido es una capa porque los casos son de Earth y los distritos de Murcia, y ninguna puede importar a la otra: un vocabulario común no tiene otro sitio legal.
- Lo que alcanzara `src/content/` acabaría empaquetado para Node, que es como `fetch`, `fs` o un global del DOM llegan a donde no existen.
- Un componente que importara `server/validate.ts` metería las reglas del servidor, y la forma de sus rechazos, en el bundle público.
- La regla amplia «las experiencias no importan `src/app/`» se pudo afirmar cuando los flags de build pasaron a `platform/` y los parámetros de prototipo de Earth a `experiences/earth/config/` (`e8852ea`).

## Qué se descartó

- Reglas solo escritas.
- Un check sobre el bundle emitido para las reglas de dirección.
- La regla estrecha «las experiencias no importan `app/navigation/`», que se mantuvo mientras quedaban aristas hacia `app/buildFlags` y `app/proto*`.
- Copiar aquí la lista de reglas: dos copias de una lista divergen.

## Se ha roto si…

- `npm run check:architecture` falla. Nombra la regla y los tres primeros infractores.
- Se renombra o se mueve un archivo que nombra una guarda de la sección 5 y la guarda no se actualiza: la regla que protege pasa en vacío (ver [trampas de arquitectura](../../trampas/arquitectura.md)).
- Una experiencia importa `src/App.tsx` o `src/components/`: **sin regla de capas** (la regla mira el prefijo `src/app/`); solo lo para la regla de ciclos cuando el módulo importado alcanza de vuelta a quien lo importa.

## Afecta a

`checks/architecture.ts`, `package.json` (`check:architecture`, `check:harnesses`), `src/`, `server/`, `api/`, `content/`
