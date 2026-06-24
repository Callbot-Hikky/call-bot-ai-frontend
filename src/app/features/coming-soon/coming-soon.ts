import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HkEmptyState } from '@shared/components/molecules/empty-state/hk-empty-state';

// Page générique. Le titre vient des données de route (liaison d'inputs du routeur).
@Component({
  selector: 'app-coming-soon',
  imports: [HkEmptyState],
  template: `
    <div class="flex min-h-[60vh] items-center justify-center">
      <hk-empty-state
        [icon]="icon()"
        title="Bientôt disponible"
        [subtitle]="'« ' + title() + ' » sera disponible dans une prochaine version.'"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComingSoonPage {
  readonly title = input('');
  readonly icon = input('lucideSettings');
}
