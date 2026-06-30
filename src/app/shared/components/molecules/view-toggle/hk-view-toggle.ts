import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';

export type ReservationView = 'list' | 'plan';

const OPTIONS: { value: ReservationView; label: string; icon: string }[] = [
  { value: 'list', label: 'Liste', icon: 'lucideList' },
  { value: 'plan', label: 'Plan', icon: 'lucideLayoutGrid' },
];

// Bascule de vue [ Liste | Plan ] (convention Google Maps liste/carte).
// Segmented control aligne sur hk-filter-bar.
@Component({
  selector: 'hk-view-toggle',
  imports: [HkIcon],
  template: `
    <div class="bg-muted inline-flex gap-1 rounded-sm p-1" role="group" aria-label="Vue">
      @for (opt of options; track opt.value) {
        <button
          type="button"
          [attr.aria-pressed]="view() === opt.value"
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] px-3 py-1 text-sm font-medium transition-colors duration-150"
          [class]="
            view() === opt.value
              ? 'bg-green-100 text-green-700'
              : 'text-muted-foreground hover:text-foreground'
          "
          (click)="view.set(opt.value)"
        >
          <hk-icon [name]="opt.icon" [size]="16" />
          {{ opt.label }}
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkViewToggle {
  readonly view = model<ReservationView>('list');
  protected readonly options = OPTIONS;
}
