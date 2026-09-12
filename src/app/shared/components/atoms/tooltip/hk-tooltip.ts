import { Directive } from '@angular/core';
import {
  BrnTooltip,
  BrnTooltipPosition,
  provideBrnTooltipDefaultOptions,
} from '@spartan-ng/brain/tooltip';
import { hlm } from '@spartan-ng/helm/utils';
import {
  DEFAULT_TOOLTIP_CONTENT_CLASSES,
  DEFAULT_TOOLTIP_SVG_CLASS,
  tooltipPositionVariants,
} from '@spartan-ng/helm/tooltip';

// Tooltip Alloquence : réutilise le style Spartan (fond foreground sombre, texte clair, 12px,
// déjà relié aux tokens) avec un sélecteur unifié [hkTooltip]. Usage : <button hkTooltip="...">.
@Directive({
  selector: '[hkTooltip]',
  providers: [
    provideBrnTooltipDefaultOptions({
      svgClasses: DEFAULT_TOOLTIP_SVG_CLASS,
      tooltipContentClasses: DEFAULT_TOOLTIP_CONTENT_CLASSES,
      arrowClasses: (position: BrnTooltipPosition) => hlm(tooltipPositionVariants({ position })),
    }),
  ],
  hostDirectives: [
    {
      directive: BrnTooltip,
      inputs: ['brnTooltip: hkTooltip', 'position', 'hideDelay', 'showDelay', 'tooltipDisabled'],
    },
  ],
})
export class HkTooltip {}
