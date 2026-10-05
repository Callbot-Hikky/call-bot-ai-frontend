import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkMenuManualForm } from '@shared/components/organisms/menu-manual-form/hk-menu-manual-form';
import { ManualMenu } from '@core/models/menu.model';

/**
 * La zone de saisie de la carte a la main. Le brouillon reste detenu par la page,
 * qui seule sait quand l'enregistrer.
 */
@Component({
  selector: 'app-menu-manual-section',
  imports: [HkButton, HkIcon, HkMenuManualForm],
  templateUrl: './menu-manual-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuManualSection {
  readonly draft = input.required<ManualMenu>();
  readonly published = input(true);
  readonly busy = input(false);
  readonly loading = input(false);

  readonly draftChange = output<ManualMenu>();
  readonly saveAsked = output<void>();
  readonly publishAsked = output<void>();
}
