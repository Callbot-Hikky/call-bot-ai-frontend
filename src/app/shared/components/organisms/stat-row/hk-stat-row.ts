import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HkStatCard } from '@shared/components/molecules/stat-card/hk-stat-card';
import { HkCard } from '@shared/components/atoms/card/hk-card';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';

export interface StatItem {
  label: string;
  value: string | number;
  icon?: string;
  delta?: string;
  trend?: 'up' | 'down' | 'neutral';
  highlight?: boolean;
}

// Rangée de cartes KPI. Affiche des skeletons pendant le chargement.
@Component({
  selector: 'hk-stat-row',
  imports: [HkStatCard, HkCard, HkSkeleton],
  template: `
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      @if (loading()) {
        @for (i of placeholders; track i) {
          <hk-card>
            <div class="flex flex-col gap-3">
              <hk-skeleton width="50%" height="0.75rem" />
              <hk-skeleton width="40%" height="2rem" />
            </div>
          </hk-card>
        }
      } @else {
        @for (stat of stats(); track stat.label) {
          <hk-stat-card
            [label]="stat.label"
            [value]="stat.value"
            [icon]="stat.icon"
            [delta]="stat.delta"
            [trend]="stat.trend ?? 'neutral'"
            [highlight]="stat.highlight ?? false"
          />
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkStatRow {
  readonly stats = input<StatItem[]>([]);
  readonly loading = input(false);
  protected readonly placeholders = [1, 2, 3, 4];
}
