import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface BarDatum {
  label: string;
  value: number;
}

// Graphe en barres simple et plat (pas de lib externe). Barres en dégradé vert.
@Component({
  selector: 'hk-bar-chart',
  template: `
    @if (bars().length === 0) {
      <div class="text-text-subtle flex h-44 items-center justify-center text-sm">
        {{ emptyLabel() }}
      </div>
    }
    <div class="flex h-44 items-end gap-1.5 sm:gap-2" [hidden]="bars().length === 0">
      @for (bar of bars(); track bar.label) {
        <div class="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <span class="text-text-muted text-xs font-medium tabular-nums">{{ bar.value }}</span>
          <div
            class="w-full rounded-t-md bg-gradient-to-t from-green-500 to-green-400 transition-[height] duration-500"
            [style.height.%]="heightPct(bar.value)"
          ></div>
        </div>
      }
    </div>
    <div class="mt-2 flex gap-1.5 sm:gap-2">
      @for (bar of bars(); track bar.label) {
        <span class="text-text-subtle flex-1 text-center font-mono text-xs">{{ bar.label }}</span>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkBarChart {
  readonly bars = input<BarDatum[]>([]);
  readonly emptyLabel = input('Aucune donnée pour le moment.');

  private readonly max = computed(() => Math.max(1, ...this.bars().map((b) => b.value)));

  protected heightPct(value: number): number {
    if (value <= 0) {
      return 2;
    }
    return Math.max(8, Math.round((value / this.max()) * 100));
  }
}
