import { ChangeDetectionStrategy, Component } from '@angular/core';

// Legende des statuts du plan (V1 = 3 statuts). Pastille + libelle, jamais la
// couleur seule (daltonisme). Roles semantiques alignes sur les tokens.
@Component({
  selector: 'hk-floor-plan-legend',
  template: `
    <div class="text-text-muted flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      @for (item of items; track item.label) {
        <span class="inline-flex items-center gap-2">
          <span class="size-3 rounded-full border" [class]="item.classes"></span>
          {{ item.label }}
        </span>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkFloorPlanLegend {
  // Semantique alignee sur les badges de la vue Liste :
  // Reservee = vert (st-confirmed), Installee = bleu (st-seated).
  protected readonly items = [
    { label: 'Libre', classes: 'bg-surface border-border-strong' },
    { label: 'Réservée', classes: 'bg-st-confirmed-bg border-st-confirmed-fg' },
    { label: 'Installée', classes: 'bg-st-seated-bg border-st-seated-fg' },
  ];
}
