import { Component, input, model } from '@angular/core';
import { HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';

@Component({
  selector: 'hk-price-range-selector',
  imports: [HlmRadioGroupImports],
  template: `
    <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <p class="shrink-0">{{ label() }} :</p>

      <hlm-radio-group
        class="flex flex-wrap gap-x-4 gap-y-2"
        [value]="selected()"
        (valueChange)="selected.set($event)"
      >
        @for (range of priceRanges; track range.id) {
          <div class="flex items-center gap-2 whitespace-nowrap">
            <hlm-radio [value]="range.id" [inputId]="range.id">
              <hlm-radio-indicator indicator />
            </hlm-radio>

            <label hlmLabel [for]="range.id" class="whitespace-nowrap">
              {{ range.symbol }}
              <span class="text-muted-foreground text-xs">({{ range.range }})</span>
            </label>
          </div>
        }
      </hlm-radio-group>
    </div>
  `,
})
export class HkPriceRangeSelector {
  label = input.required<string>();

  selected = model<string>('');

  readonly priceRanges = [
    {
      id: '€',
      symbol: '€',
      range: 'moins de 15€',
    },
    {
      id: '€€',
      symbol: '€€',
      range: '15€ – 30€',
    },
    {
      id: '€€€',
      symbol: '€€€',
      range: '30€ – 60€',
    },
    {
      id: '€€€€',
      symbol: '€€€€',
      range: 'plus de 60€',
    },
  ];
}
