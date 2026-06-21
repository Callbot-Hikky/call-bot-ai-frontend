import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HkEmptyState } from '@shared/components/molecules/empty-state/hk-empty-state';

// Page générique. Le titre vient des données de route (liaison d'inputs du routeur).
@Component({
  selector: 'app-coming-soon',
  imports: [HkEmptyState],
  template: `
    <hk-empty-state
      icon="lucideSettings"
      title="Bientôt disponible"
      [subtitle]="title() + ' arrivera dans une prochaine version.'"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComingSoonPage {
  readonly title = input('');
}
