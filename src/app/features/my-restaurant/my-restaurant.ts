import { Component, DestroyRef, inject, effect, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HkPageHeader } from '@shared/components/organisms/page-header/hk-page-header';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkRestaurantContextForm } from '@shared/components/organisms/restaurant-context-form/hk-restaurant-context-form';
import { HkSkeleton } from '@shared/components/atoms/skeleton/hk-skeleton';
import { RestaurantContextService } from '@core/services/restaurant-context.service';
import { fromDto, EMPTY_DTO, isFullDto, toDto } from '@core/models/restaurant-context-dto.model';
import { RestaurantService } from '@core/services/restaurant.service';
import { ToastService } from '@core/services/toast.service';
import { SessionService } from '@core/services/session.service';

@Component({
  selector: 'app-my-restaurant',
  imports: [HkPageHeader, HkButton, HkRestaurantContextForm, HkIcon, HkSkeleton],
  template: `
    <hk-page-header
      subtitle="Aidez notre IA à mieux répondre à vos clients. 
Ces informations sont utilisées par notre assistant IA pour répondre correctement aux appels de vos clients."
    >
      <hk-button
        size="sm"
        data-testid="save-context"
        [disabled]="saving() || !store.isDirty()"
        (click)="handleSave()"
      >
        <hk-icon name="lucideSave" [size]="16" />
        {{ saving() ? 'Enregistrement…' : 'Enregistrer' }}
      </hk-button>
    </hk-page-header>

    @if (service.error()) {
      <div
        class="bg-card border-border/70 flex flex-col items-center gap-3 rounded-lg border p-10 text-center shadow-md"
      >
        <hk-icon name="lucideTriangleAlert" [size]="32" class="text-st-cancelled-fg" />
        <p class="text-text-strong text-base font-medium">Impossible de charger le restaurant</p>
        <p class="text-muted-foreground text-sm">Vérifiez votre connexion et réessayez.</p>
        <hk-button size="sm" variant="secondary" (click)="service.loadRestaurant(restaurantId)">
          <hk-icon name="lucideRefreshCw" [size]="14" />
          Réessayer
        </hk-button>
      </div>
    } @else if (service.loading()) {
      <div class="flex flex-col gap-6">
        <hk-skeleton height="1.5rem" width="14rem" />
        <div class="grid gap-4 sm:grid-cols-2">
          <hk-skeleton height="6rem" />
          <hk-skeleton height="6rem" />
          <hk-skeleton height="6rem" />
          <hk-skeleton height="6rem" />
        </div>
        <hk-skeleton height="10rem" />
      </div>
    } @else {
      <hk-restaurant-context-form />
    }
  `,
})
export class MyRestaurantPage {
  protected readonly store = inject(RestaurantContextService);
  protected readonly service = inject(RestaurantService);
  private readonly session = inject(SessionService);
  protected get restaurantId(): string {
    return this.session.restaurantId() ?? '';
  }
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly saving = signal(false);

  constructor() {
    this.service.loadRestaurant(this.restaurantId);

    effect(() => {
      const restaurant = this.service.restaurant();

      if (restaurant) {
        const dto = isFullDto(restaurant.attributes) ? restaurant.attributes : EMPTY_DTO;
        this.store.hydrate(fromDto(dto));
      }
    });
  }

  handleSave() {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    const dto = toDto(this.store.context());
    this.service
      .patchAttributesRestaurant(this.restaurantId, dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (restaurant) => {
          setTimeout(() => this.saving.set(false), 500);
          const dto = isFullDto(restaurant.attributes) ? restaurant.attributes : EMPTY_DTO;
          this.store.hydrate(fromDto(dto));
          this.toast.show('Restaurant enregistré.', 'success');
        },
        error: () => {
          setTimeout(() => this.saving.set(false), 500);
          this.toast.show("Échec de l'enregistrement.", 'error');
        },
      });
  }
}
