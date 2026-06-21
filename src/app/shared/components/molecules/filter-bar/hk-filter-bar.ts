import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { HkInput } from '@shared/components/atoms/input/hk-input';
import { ReservationStatus } from '@core/models/reservation.model';

export type StatusFilter = ReservationStatus | 'all';

const OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'pending', label: 'En attente' },
  { value: 'confirmed', label: 'Confirmées' },
  { value: 'seated', label: 'Installées' },
  { value: 'cancelled', label: 'Annulées' },
];

// Barre de filtres : segmented control de statut + recherche. Pas de <form>.
@Component({
  selector: 'hk-filter-bar',
  imports: [HkInput],
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="bg-muted inline-flex flex-wrap gap-1 rounded-sm p-1">
        @for (opt of options; track opt.value) {
          <button
            type="button"
            class="cursor-pointer rounded-[6px] px-3 py-1 text-sm font-medium transition-colors duration-150"
            [class]="
              status() === opt.value
                ? 'bg-green-100 text-green-700'
                : 'text-muted-foreground hover:text-foreground'
            "
            (click)="status.set(opt.value)"
          >
            {{ opt.label }}
          </button>
        }
      </div>
      <div class="w-64">
        <hk-input
          icon="lucideSearch"
          placeholder="Rechercher (nom, téléphone)"
          [(value)]="search"
        />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkFilterBar {
  readonly status = model<StatusFilter>('all');
  readonly search = model('');
  protected readonly options = OPTIONS;
}
