import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';

// Carte KPI : un seul grand chiffre, pastille d'icône colorée, delta optionnel.
// Variante `highlight` : surface « flamme » (.hk-flame, cf. styles.scss) reprise
// du hero de la landing, pour mettre en avant la métrique phare.
@Component({
  selector: 'hk-stat-card',
  imports: [HkIcon],
  host: { class: 'block h-full' },
  template: `
    <div [class]="cardClasses()">
      <div class="flex min-h-9 items-start justify-between gap-3">
        <span class="text-xs font-medium tracking-wide uppercase" [class]="labelClasses()">
          {{ label() }}
        </span>
        @if (icon()) {
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-lg"
            [class]="chipClasses()"
          >
            <hk-icon [name]="icon()!" [size]="18" />
          </span>
        }
      </div>
      <span
        class="mt-3 block font-mono text-4xl font-bold tracking-tight tabular-nums"
        [class]="valueClasses()"
      >
        {{ value() }}
      </span>
      @if (delta()) {
        <span class="mt-1 block text-xs font-medium" [class]="deltaClasses()">{{ delta() }}</span>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkStatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input<string>();
  readonly delta = input<string>();
  readonly trend = input<'up' | 'down' | 'neutral'>('neutral');
  readonly highlight = input(false);

  protected readonly cardClasses = computed(() =>
    this.highlight()
      ? 'hk-flame flex h-full flex-col rounded-lg border p-6 shadow-md'
      : 'bg-card border-border/70 flex h-full flex-col rounded-lg border p-6 shadow-md',
  );

  protected readonly labelClasses = computed(() =>
    this.highlight() ? 'text-white/85' : 'text-muted-foreground',
  );

  protected readonly chipClasses = computed(() =>
    this.highlight() ? 'bg-white/20 text-white' : 'bg-warm-100 text-warm-700',
  );

  protected readonly valueClasses = computed(() =>
    this.highlight() ? 'text-white' : 'text-text-strong',
  );

  protected readonly deltaClasses = computed(() => {
    if (this.highlight()) {
      return 'text-white/85';
    }
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
