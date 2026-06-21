import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// En-tête d'écran : titre/sous-titre optionnels + zone d'actions à droite (slot).
@Component({
  selector: 'hk-page-header',
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        @if (title()) {
          <h1 class="text-text-strong text-2xl font-semibold">{{ title() }}</h1>
        }
        @if (subtitle()) {
          <p class="text-muted-foreground text-sm">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex items-center gap-2">
        <ng-content />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkPageHeader {
  readonly title = input<string>();
  readonly subtitle = input<string>();
}
