# La pila de capas tiene una sola lista, y el orden importa más que las cifras

**Estado:** vigente · **Desde:** 2026-08-07 (plan 002 §3); capas del menú desde el 2026-09-09 · **Sustituye a:** PROJECT_MEMORY §3, «Layer stack (z-index)» (archivado)

## Decisión

1. **La lista canónica es el comentario «Layer stack» de `src/styles.css`.** Quien añada o mueva una capa la actualiza ahí. Los comentarios de otras hojas (`auditSection.css`, `blog.css`) son resúmenes. Los valores viven en cada selector o constante (`Z_INDEX` en `campusOverlay.ts` y `handoffImage.ts`), no aquí.
2. **Reglas de orden que no se pueden invertir:**
   - la capa del [menú del móvil](menu-movil.md) queda **detrás** del canvas, porque la tarjeta la descubre;
   - el destello del warp cubre todo lo de la escena, también la brújula, para que el corte tape lo que desaparece;
   - la pista queda sobre el pie y bajo el control de navegación;
   - la cabecera de la escena queda sobre la cortina de auditoría y los diálogos (es transparente y solo sus controles reciben eventos);
   - la cabecera del blog queda bajo la cortina y los diálogos, porque es opaca ([cabecera única](cabecera-unica.md));
   - la cubierta de entrada al blog queda entre la cabecera y el blog, que la tapa cuando pinta;
   - el cursor queda por encima de todo, también de la depuración.
3. **Las capas a pantalla completa que no son controles no reciben eventos** (`.murcia-ui`, `.site-header` en la escena, `.audit-overlay`, `.site-menu-stage`); sus hijos los recuperan.

## Por qué

Cada relación nació de un fallo concreto: barras que se veían a través de un panel, un aviso que tapaba el destello, una barra opaca que tapaba la flecha de vuelta de la auditoría. La lista solo vale si hay una sola.

## Qué se descartó

Las etiquetas geográficas en su propia capa (se fueron con los marcadores el 2026-08-19) y el burger dibujado en el canvas, bajo los paneles.

## Se ha roto si…

- Falla `src/experiences/murcia/blogDisplay/handoffImage.test.ts` (la cubierta entre la cabecera y el blog).
- Un arrastre sobre la escena deja de funcionar en los dos mundos: una capa a pantalla completa capturó los eventos (`e2e/navigation.spec.ts` lo nota indirectamente).
- El resto, solo a ojo. Hoy la lista de `styles.css` está incompleta (ver [trampas](../../trampas/interfaz.md)).

## Afecta a

`src/styles.css`, `src/components/siteMenu.css`, `src/components/siteHeader.css`, `src/components/auditSection.css`, `src/components/modal.css`, `src/components/consentBanner.css`, `src/experiences/murcia/styles/murcia.css`, `src/experiences/murcia/campus/section/campusOverlay.ts`, `src/experiences/murcia/blogDisplay/handoffImage.ts`, `src/intro-draw/introDraw.ts`, `src/blog/blog.css`, `src/notFound/notFound.css`
