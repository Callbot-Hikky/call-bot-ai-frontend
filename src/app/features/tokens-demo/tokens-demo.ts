import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkBadge } from '@shared/components/atoms/badge/hk-badge';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { ReservationStatus } from '@core/models/reservation.model';

// Page temporaire de validation (tokens + atoms). À supprimer ensuite.
@Component({
  selector: 'app-tokens-demo',
  imports: [HkIcon, HkBadge, HkButton],
  templateUrl: './tokens-demo.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TokensDemo {
  protected readonly greens = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  protected readonly statuses: ReservationStatus[] = [
    'pending',
    'confirmed',
    'seated',
    'completed',
    'cancelled',
    'no_show',
  ];
  protected readonly icons = [
    'lucideCalendar',
    'lucidePhone',
    'lucideUsers',
    'lucideSettings',
    'lucideBell',
  ];
}
