import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkBadge } from '@shared/components/atoms/badge/hk-badge';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIconButton } from '@shared/components/atoms/icon-button/hk-icon-button';
import { HkInput } from '@shared/components/atoms/input/hk-input';
import { HkAvatar } from '@shared/components/atoms/avatar/hk-avatar';
import { HkCard } from '@shared/components/atoms/card/hk-card';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { HkSpinner } from '@shared/components/atoms/spinner/hk-spinner';
import { HkTooltip } from '@shared/components/atoms/tooltip/hk-tooltip';
import { HkSectionHeader } from '@shared/components/molecules/section-header/hk-section-header';
import { HkStatCard } from '@shared/components/molecules/stat-card/hk-stat-card';
import { HkEmptyState } from '@shared/components/molecules/empty-state/hk-empty-state';
import { HkNavItem } from '@shared/components/molecules/nav-item/hk-nav-item';
import { HkFilterBar } from '@shared/components/molecules/filter-bar/hk-filter-bar';
import { HkReservationRow } from '@shared/components/molecules/reservation-row/hk-reservation-row';
import { HkToaster } from '@shared/components/molecules/toast/hk-toaster';
import { ToastService } from '@core/services/toast.service';
import { Reservation, ReservationStatus } from '@core/models/reservation.model';

// Page temporaire de validation (tokens + atoms). À supprimer ensuite.
@Component({
  selector: 'app-tokens-demo',
  imports: [
    HkIcon,
    HkBadge,
    HkButton,
    HkIconButton,
    HkInput,
    HkAvatar,
    HkCard,
    HkSkeleton,
    HkSpinner,
    HkTooltip,
    HkSectionHeader,
    HkStatCard,
    HkEmptyState,
    HkNavItem,
    HkFilterBar,
    HkReservationRow,
    HkToaster,
  ],
  templateUrl: './tokens-demo.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TokensDemo {
  private readonly toastService = inject(ToastService);

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

  protected readonly demoReservations: Reservation[] = [
    {
      id: 'r-1',
      customerName: 'Camille Durand',
      phone: '+33 6 12 34 56 78',
      dateTime: '2026-06-21T20:00:00+02:00',
      partySize: 4,
      table: { id: 't1', name: 'T1', capacity: 4 },
      status: 'confirmed',
      source: 'callbot',
    },
    {
      id: 'r-2',
      customerName: 'Yanis Bensaïd',
      phone: '+33 7 98 76 54 32',
      dateTime: '2026-06-21T21:30:00+02:00',
      partySize: 2,
      status: 'pending',
      source: 'manual',
    },
  ];

  protected showToast(): void {
    this.toastService.show('Réservation confirmée', 'success');
  }
}
