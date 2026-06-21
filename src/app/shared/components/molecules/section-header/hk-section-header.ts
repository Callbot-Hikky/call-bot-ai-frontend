import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// En-tête de section : titre + sous-texte optionnel + slot actions à droite.
@Component({
  selector: 'hk-section-header',
  template: `
    <div class="mb-4 flex items-start justify-between gap-4">
      <div class="flex flex-col gap-0.5">
        <h2 class="text-text-strong text-lg font-semibold">{{ title() }}</h2>
        @if (subtitle()) {
          <p class="text-muted-foreground text-sm">{{ subtitle() }}</p>
        }
      </div>
      <div class="shrink-0">
        <ng-content />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkSectionHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
