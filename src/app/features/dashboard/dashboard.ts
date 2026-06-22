import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HkStatCard } from '@shared/components/molecules/stat-card/hk-stat-card';

@Component({
  selector: 'app-dashboard',
  imports: [HkStatCard],
  template: `
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <hk-stat-card label="Réservations" [value]="14" icon="lucideCalendar" />
      <hk-stat-card label="Couverts" [value]="42" icon="lucideUsers" />
      <hk-stat-card
        label="Captées par le bot"
        [value]="9"
        delta="+18%"
        trend="up"
        [highlight]="true"
      />
      <hk-stat-card label="Confirmation" value="86%" delta="-3%" trend="down" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {}
