import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HkCard } from '@shared/components/atoms/card/hk-card';
import { HkEmptyState } from '@shared/components/molecules/empty-state/hk-empty-state';
import { HkButton } from '@shared/components/atoms/button/hk-button';

// Placeholder. La liste complète des réservations sera construite à l'étape design 06.
@Component({
  selector: 'app-reservations',
  imports: [HkCard, HkEmptyState, HkButton],
  template: `
    <hk-card>
      <hk-empty-state
        icon="lucideCalendar"
        title="Liste des réservations"
        subtitle="L'écran complet (filtres, tri, détail) arrive prochainement."
      >
        <hk-button size="sm">Actualiser</hk-button>
      </hk-empty-state>
    </hk-card>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationsPage {}
