import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Bloc de chargement (remplace tout spinner de page). Shimmer coupé en reduced-motion.
@Component({
  selector: 'hk-skeleton',
  template: `
    <div
      class="bg-muted animate-pulse motion-reduce:animate-none"
      [class.rounded-md]="rounded() === 'md'"
      [class.rounded-full]="rounded() === 'full'"
      [style.width]="width()"
      [style.height]="height()"
    ></div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkSkeleton {
  readonly width = input('100%');
  readonly height = input('1rem');
  readonly rounded = input<'md' | 'full'>('md');
}
