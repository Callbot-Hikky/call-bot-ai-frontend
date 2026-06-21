import { ChangeDetectionStrategy, Component } from '@angular/core';
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
import { ReservationStatus } from '@core/models/reservation.model';

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
  ],
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
