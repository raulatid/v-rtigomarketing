import type { DistrictContent } from '../../../content/types';
import { splitServiceCopy } from '../district/serviceCopy';
import { campusLabel, DEFAULT_LOCALE } from './campusLabels';
import { parseServicesContent, type ServicesContent } from './content/servicesContent';

/** Map CMS copy to the campus. An explicit line break preserves the editor's
 * two-line explanation; older prose uses its opening summary. Detail and the
 * legacy caption remain in the portable model but are not rendered by the site.
 * Highlights use the existing Sanity measures field, preserving published data.
 *
 * ## The shapes come from the content now, not from a table beside the scene
 *
 * `symbol` and `figure` used to be looked up in `scene/cityDistrictBindings.ts`
 * by the service's slug, and a service with no row there produced `undefined`
 * for both — which `parseServicesContent` rejects, and it rejects per DOCUMENT,
 * so one unlisted service took the whole campus down to scenery. Publishing a
 * service therefore required a code change, and the day it did not get one the
 * build failed for that service while four others silently kept figures chosen
 * for copy that had since been rewritten.
 *
 * Both are Studio fields now. The symbol always resolves (the content build
 * defaults it); the figure may be null, and null is a supported document.
 */
export function buildServicesContent(
  content: DistrictContent,
  locale: string = DEFAULT_LOCALE,
): ServicesContent | null {
  const services = content.services.map((service) => {
    const copy = splitServiceCopy(service.body);
    const opening = service.body.trim().split(/\n\s*\n/)[0]!;
    const rest = copy.detail.startsWith(copy.summary)
      ? copy.detail.slice(copy.summary.length).trim()
      : '';
    return {
      id: service.id,
      title: service.title,
      subtitle: opening.includes('\n') ? opening : copy.summary,
      detail: rest === '' ? copy.detail : rest,
      icon: service.symbol,
      figure: service.figure,
      color: service.particleColor,
      // The legend names what the FIGURE draws, so with no figure it has
      // nothing to name and is dropped rather than shown beside a symbol that
      // never turns into what it describes. The five services shipping the day
      // this landed are exactly that case: their copy was rewritten and their
      // captions still describe the figures the old copy argued.
      caption: service.figure === null ? null : service.figureCaption,
      measures: service.measures,
    };
  });

  return parseServicesContent({
    intro: {
      title: content.label,
      subtitle: content.summary,
      hint: campusLabel(locale, 'hint'),
      color: content.particleColor,
    },
    services,
  });
}
