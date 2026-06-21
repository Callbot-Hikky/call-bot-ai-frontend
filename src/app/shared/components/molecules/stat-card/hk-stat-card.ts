import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkCard } from '@shared/components/atoms/card/hk-card';

// Carte d'indicateur : un seul grand chiffre (mono tabular), delta optionnel.
@Component({
  selector: 'hk-stat-card',
  imports: [HkIcon, HkCard],
  template: `
    <hk-card>
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {{ label() }}
          </span>
          @if (icon()) {
            <hk-icon [name]="icon()!" [size]="16" class="text-text-subtle" />
          }
        </div>
        <span class="text-text-strong font-mono text-4xl font-semibold tabular-nums">
          {{ value() }}
        </span>
        @if (delta()) {
          <span class="text-xs font-medium" [class]="deltaClass()">{{ delta() }}</span>
        }
      </div>
    </hk-card>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkStatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input<string>();
  readonly delta = input<string>();
  readonly trend = input<'up' | 'down' | 'neutral'>('neutral');

  protected readonly deltaClass = computed(() => {
    switch (this.trend()) {
      case 'up':
        return 'text-st-confirmed-fg';
      case 'down':
        return 'text-st-cancelled-fg';
      default:
        return 'text-muted-foreground';
    }
  });
}
