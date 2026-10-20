# Trampas: arquitectura y módulos

Errores reales y comportamientos que parecen bugs pero son intencionados. Las decisiones están en [`decisiones/arquitectura/`](../decisiones/arquitectura/).

## El check de dependencias

1. **Un `import type` cuenta como arista.** `checks/architecture.ts` lee el texto del import, no lo que queda tras compilar: un tipo cruza una frontera igual que un valor. Por eso los contratos que una experiencia lee de la aplicación están en `src/interaction/` (`NavigationView`, `AuditComposition`) y no en `src/app/`. No muevas un tipo a `src/app/` porque «solo es un tipo». El caso del especificador distinto junto a un `import()` está en [`blog.md`](blog.md), n.º 22. Fija: `check:architecture`.
2. **«La capa de aplicación» del check es el prefijo `src/app/`.** `src/App.tsx`, `src/components/` y `src/corner-logo/` no entran. Una experiencia que importara `App` o `SceneCanvas` solo fallaría por la regla de ciclos, porque ambos la alcanzan de vuelta; un componente que no la alcance (por ejemplo `SiteHeader.tsx`) pasaría el check. Hoy Earth importa un tipo de `corner-logo/cornerLogoConfig.ts` (`CornerLogoHandle`), y es legal. Sin test.
3. **Solo se siguen especificadores relativos, desde archivos `.ts` y `.tsx` que no son tests.** Los paquetes, los `.mjs`, el CSS y el GLSL no están en el grafo, y un test puede importar cualquier cosa. No hay alias de rutas en `vite.config.ts` ni en `tsconfig.json`: si se añade uno, sus imports desaparecen del grafo sin que falle nada, salvo que caiga mucho el número de imports resueltos. Sin test.
4. **Una regla que solo dice «no» pasa en vacío si lo que vigila desaparece.** Renombrar `server/`, `content/`, `api/audit.ts`, `api/contact.ts`, `BlogRoute.tsx`, `blogPosts`, `headerLogoRuntime.ts`, `SceneCanvas.tsx` o `RenderPipeline.tsx`, o quitar un directorio de `ROOTS`, deja reglas en verde sin vigilar nada. Las guardas de la sección 5 del check nombran esos archivos: actualízalas en el mismo cambio y no las borres. Fija: las propias guardas.
5. **Si tocas el resolvedor del check, no uses `existsSync`.** En Windows las rutas no distinguen mayúsculas: `existsSync('src/App')` encuentra el directorio `src/app/`, y el grafo se cortaba en la raíz de la aplicación. El resolvedor prueba las extensiones antes que la ruta desnuda y exige un archivo. También quita el `.js` del especificador antes de resolver, porque `server/` y `api/` importan con `.js` (ver [`formularios-y-privacidad.md`](formularios-y-privacidad.md), n.º 1). Sin test.
6. **La regla del movimiento reducido busca el literal `matchMedia('(prefers-reduced-motion:`** (con comillas simples o dobles). Una consulta escrita con una plantilla o guardada en una variable pasa el check. Sin test.

## Ya migradas en otras áreas

- Lo que el grafo no ve (en qué chunk cae un import legal): [`build.md`](build.md), n.º 7.
- Ninguna guarda de `visibilitychange` en los relojes de la escena: [`transicion.md`](transicion.md), n.º 7.
- Un único escritor de `auditView.open`: [`earth.md`](earth.md), n.º 10.
- Prioridades de `useFrame` y relojes en un rAF propio: [`render.md`](render.md), n.º 1-3.
- Liberación de geometrías en `useMemo` y de modelos clonados de una plantilla: [`render.md`](render.md), n.º 10-11.

## Cómo verificar esta área

| Cambio | Comprobación |
|---|---|
| Imports entre capas, entradas o fronteras de ejecución | `npm run check:architecture` |
| El propio `checks/architecture.ts` | `npm run check:architecture`, y comprobar que el número de módulos e imports resueltos no cae |
| Canales por fotograma (`navigationSignals.ts`, `auditView.ts`, `sequenceState.ts`) | `auditView.test.ts`, `sequenceState.test.ts`, `useExperienceTransition.test.tsx` |
| Movimiento reducido | `npx vitest run src/platform/motionPreference.test.ts`; `e2e/motion-preference.spec.ts`, solo si se pide e2e |
| Pestaña oculta | `npx vitest run src/intro-draw/playhead.test.ts src/app/audio/backgroundMusic.test.ts`; a mano: ocultar la pestaña a mitad del warp y del dibujo, y volver |
| Fallos y degradación | `e2e/degraded.spec.ts`, solo si se pide e2e; a mano: bloquear el GLB y comprobar que no se ofrece Murcia |
| Pantallas de la torre y del campus | `npx vitest run src/experiences/murcia/screens src/experiences/murcia/landmark/towerScreen src/experiences/murcia/campus/campusScreen`; `npm run check:architecture` |

**Sin cobertura:**
- imports de una experiencia hacia `src/App.tsx` o `src/components/`;
- imports no relativos o desde tests;
- que un valor por fotograma pase a estado de React;
- que un reloj de la escena avance con la pestaña oculta, y el reinicio de la entrada al ocultarse;
- que no se ofrezca Murcia cuando la ciudad no carga;
- que una capa de Earth trabaje con `active` en falso.
