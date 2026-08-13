import { Component, inject } from '@angular/core';
import { HkPageHeader } from '@shared/components/organisms/page-header/hk-page-header';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkRestaurantContextForm } from '@shared/components/organisms/restaurant-context-form/hk-restaurant-context-form';
import { RestaurantContextService } from '@core/services/restaurant-context.service';
import { toDto } from '@core/models/restaurant-context-dto.model';

@Component({
  selector: 'app-my-restaurant',
  imports: [HkPageHeader, HkButton, HkRestaurantContextForm, HkIcon],
  template: `
    <hk-page-header
      subtitle="Aidez notre IA à mieux répondre à vos clients. 
Ces informations sont utilisées par notre assistant IA pour répondre correctement aux appels de vos clients."
    >
      <hk-button size="sm" data-testid="save-context" (click)="handleSave()">
        <hk-icon name="lucideSave" [size]="16" />

        Enregistrer
      </hk-button>
    </hk-page-header>

    <hk-restaurant-context-form />
  `,
})
export class MyRestaurantPage {
  private store = inject(RestaurantContextService);

  // TODO appeler le toast en cas d'échec ou réussite + brancher l'API backend
  handleSave() {
    const ctx = this.store.context();
    const dto = toDto(ctx);
    console.log('UI context →', ctx);
    console.log('DTO à envoyer au backend →', dto);
  }
}
