import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';

// État vide sobre : icône douce, titre, sous-texte, action optionnelle (slot).
@Component({
  selector: 'hk-empty-state',
  imports: [HkIcon],
  template: `
    <div class="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div class="bg-muted text-text-subtle flex size-12 items-center justify-center rounded-full">
        <hk-icon [name]="icon()" [size]="24" />
      </div>
      <div class="flex flex-col gap-1">
        <p class="text-text-strong font-medium">{{ title() }}</p>
        @if (subtitle()) {
          <p class="text-muted-foreground text-sm">{{ subtitle() }}</p>
        }
      </div>
      <ng-content />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkEmptyState {
  readonly icon = input('lucideCalendar');
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
