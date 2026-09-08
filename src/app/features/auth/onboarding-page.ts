import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { RestaurantService } from '@core/services/restaurant.service';
import { RestaurantHoursService } from '@core/services/restaurant-hours.service';
import { TableService } from '@core/services/table.service';
import { RestaurantContextService } from '@core/services/restaurant-context.service';
import { SessionService } from '@core/services/session.service';
import { HkRestaurantContextForm } from '@shared/components/organisms/restaurant-context-form/hk-restaurant-context-form';
import { toDto } from '@core/models/restaurant-context-dto.model';

interface ServiceHours {
  key: 'lunch' | 'dinner';
  label: string;
  open: boolean;
  opensAt: string;
  closesAt: string;
}

interface DayHours {
  label: string;
  dayOfWeek: number;
  services: ServiceHours[];
}

function weekday(label: string, dayOfWeek: number, open: boolean): DayHours {
  return {
    label,
    dayOfWeek,
    services: [
      { key: 'lunch', label: 'Déjeuner', open, opensAt: '12:00', closesAt: '14:30' },
      { key: 'dinner', label: 'Dîner', open, opensAt: '19:00', closesAt: '22:30' },
    ],
  };
}

const DEFAULT_DAYS: DayHours[] = [
  weekday('Lundi', 0, true),
  weekday('Mardi', 1, true),
  weekday('Mercredi', 2, true),
  weekday('Jeudi', 3, true),
  weekday('Vendredi', 4, true),
  weekday('Samedi', 5, true),
  weekday('Dimanche', 6, false),
];

@Component({
  selector: 'hk-onboarding-page',
  standalone: true,
  imports: [FormsModule, HkRestaurantContextForm],
  template: `
    <div class="bg-surface-2 min-h-screen p-4">
      <div class="mx-auto w-full max-w-2xl space-y-6 py-8">
        <div class="flex items-center gap-2">
          @for (s of [1, 2, 3, 4]; track s) {
            <div
              class="h-1.5 flex-1 rounded-full"
              [class.bg-primary]="step() >= s"
              [class.bg-border]="step() < s"
            ></div>
          }
        </div>
        <p class="text-fg-muted text-sm">Étape {{ step() }} sur 4</p>

        @if (error()) {
          <p class="text-st-cancelled-fg text-sm">{{ error() }}</p>
        }

        @if (step() === 1) {
          <form (ngSubmit)="submitCoordinates()" class="space-y-4">
            <h1 class="text-fg text-xl font-semibold">Votre restaurant</h1>
            <p class="text-fg-muted text-sm">
              Le téléphone est le numéro sur lequel l'assistant vocal recevra les appels.
            </p>
            <label class="text-fg-muted block text-sm">
              Nom
              <input
                name="name"
                required
                [ngModel]="name()"
                (ngModelChange)="name.set($event)"
                class="border-border bg-surface text-fg mt-1 w-full rounded-md border px-3 py-2"
              />
            </label>
            <label class="text-fg-muted block text-sm">
              Téléphone
              <input
                name="phone"
                required
                type="tel"
                placeholder="+33 1 00 00 00 00"
                [ngModel]="phone()"
                (ngModelChange)="phone.set($event)"
                class="border-border bg-surface text-fg mt-1 w-full rounded-md border px-3 py-2"
              />
            </label>
            <label class="text-fg-muted block text-sm">
              Adresse
              <input
                name="address"
                [ngModel]="address()"
                (ngModelChange)="address.set($event)"
                class="border-border bg-surface text-fg mt-1 w-full rounded-md border px-3 py-2"
              />
            </label>
            <div class="grid grid-cols-2 gap-4">
              <label class="text-fg-muted block text-sm">
                Ville
                <input
                  name="city"
                  [ngModel]="city()"
                  (ngModelChange)="city.set($event)"
                  class="border-border bg-surface text-fg mt-1 w-full rounded-md border px-3 py-2"
                />
              </label>
              <label class="text-fg-muted block text-sm">
                Code postal
                <input
                  name="postalCode"
                  [ngModel]="postalCode()"
                  (ngModelChange)="postalCode.set($event)"
                  class="border-border bg-surface text-fg mt-1 w-full rounded-md border px-3 py-2"
                />
              </label>
            </div>
            <button
              type="submit"
              [disabled]="loading()"
              class="bg-primary text-primary-fg w-full rounded-md px-4 py-2 font-medium disabled:opacity-60"
            >
              {{ loading() ? 'Création…' : 'Continuer' }}
            </button>
          </form>
        }

        @if (step() === 2) {
          <div class="space-y-5">
            <h1 class="text-fg text-xl font-semibold">Horaires d'ouverture</h1>
            @for (day of days(); track day.dayOfWeek) {
              <div class="border-border space-y-2 rounded-md border p-3">
                <p class="text-fg font-medium">{{ day.label }}</p>
                @for (svc of day.services; track svc.key) {
                  <div class="flex items-center gap-3">
                    <label class="text-fg flex w-28 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        [ngModel]="svc.open"
                        (ngModelChange)="setService(day.dayOfWeek, svc.key, 'open', $event)"
                      />
                      {{ svc.label }}
                    </label>
                    @if (svc.open) {
                      <input
                        type="time"
                        [ngModel]="svc.opensAt"
                        (ngModelChange)="setService(day.dayOfWeek, svc.key, 'opensAt', $event)"
                        class="border-border bg-surface text-fg rounded-md border px-2 py-1"
                      />
                      <span class="text-fg-muted">→</span>
                      <input
                        type="time"
                        [ngModel]="svc.closesAt"
                        (ngModelChange)="setService(day.dayOfWeek, svc.key, 'closesAt', $event)"
                        class="border-border bg-surface text-fg rounded-md border px-2 py-1"
                      />
                    } @else {
                      <span class="text-fg-muted text-sm">Fermé</span>
                    }
                  </div>
                }
              </div>
            }
            <div class="flex gap-3">
              <button
                (click)="submitHours()"
                [disabled]="loading()"
                class="bg-primary text-primary-fg rounded-md px-4 py-2 font-medium disabled:opacity-60"
              >
                {{ loading() ? 'Enregistrement…' : 'Continuer' }}
              </button>
              <button (click)="step.set(3)" class="text-fg-muted rounded-md px-4 py-2">
                Passer
              </button>
            </div>
          </div>
        }

        @if (step() === 3) {
          <div class="space-y-4">
            <h1 class="text-fg text-xl font-semibold">Votre établissement</h1>
            <p class="text-fg-muted text-sm">
              Ces informations aident l'assistant à répondre aux questions des clients.
            </p>
            <hk-restaurant-context-form />
            <div class="flex gap-3">
              <button
                (click)="submitContext()"
                [disabled]="loading()"
                class="bg-primary text-primary-fg rounded-md px-4 py-2 font-medium disabled:opacity-60"
              >
                {{ loading() ? 'Enregistrement…' : 'Continuer' }}
              </button>
              <button (click)="step.set(4)" class="text-fg-muted rounded-md px-4 py-2">
                Passer
              </button>
            </div>
          </div>
        }

        @if (step() === 4) {
          <div class="space-y-4">
            <h1 class="text-fg text-xl font-semibold">Vos tables</h1>
            <p class="text-fg-muted text-sm">
              On crée un jeu de tables de départ. Vous pourrez les ajuster dans le plan de salle.
            </p>
            <div class="grid grid-cols-2 gap-4">
              <label class="text-fg-muted block text-sm">
                Nombre de tables
                <input
                  type="number"
                  min="0"
                  [ngModel]="tableCount()"
                  (ngModelChange)="tableCount.set(+$event)"
                  class="border-border bg-surface text-fg mt-1 w-full rounded-md border px-3 py-2"
                />
              </label>
              <label class="text-fg-muted block text-sm">
                Couverts par table
                <input
                  type="number"
                  min="1"
                  [ngModel]="tableCapacity()"
                  (ngModelChange)="tableCapacity.set(+$event)"
                  class="border-border bg-surface text-fg mt-1 w-full rounded-md border px-3 py-2"
                />
              </label>
            </div>
            <div class="flex gap-3">
              <button
                (click)="finish()"
                [disabled]="loading()"
                class="bg-primary text-primary-fg rounded-md px-4 py-2 font-medium disabled:opacity-60"
              >
                {{ loading() ? 'Finalisation…' : 'Terminer' }}
              </button>
              <button (click)="finish(true)" class="text-fg-muted rounded-md px-4 py-2">
                Terminer sans tables
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class OnboardingPage {
  private readonly restaurants = inject(RestaurantService);
  private readonly hours = inject(RestaurantHoursService);
  private readonly tablesService = inject(TableService);
  private readonly contextStore = inject(RestaurantContextService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly step = signal(1);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly restaurantId = signal<string | null>(null);

  readonly name = signal('');
  readonly phone = signal('');
  readonly address = signal('');
  readonly city = signal('');
  readonly postalCode = signal('');

  readonly days = signal<DayHours[]>(
    DEFAULT_DAYS.map((d) => ({ ...d, services: d.services.map((s) => ({ ...s })) })),
  );

  readonly tableCount = signal(4);
  readonly tableCapacity = signal(4);

  setService(
    dayOfWeek: number,
    key: 'lunch' | 'dinner',
    field: 'open' | 'opensAt' | 'closesAt',
    value: string | boolean,
  ): void {
    this.days.update((days) =>
      days.map((d) =>
        d.dayOfWeek === dayOfWeek
          ? {
              ...d,
              services: d.services.map((s) => (s.key === key ? { ...s, [field]: value } : s)),
            }
          : d,
      ),
    );
  }

  async submitCoordinates(): Promise<void> {
    if (this.loading()) {
      return;
    }
    const organizationId = this.session.user()?.organizationId;
    if (!organizationId) {
      this.error.set('Session expirée, reconnectez-vous.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const created = await firstValueFrom(
        this.restaurants.create({
          organizationId,
          name: this.name(),
          phoneNumber: this.phone(),
          address: this.address() || undefined,
          city: this.city() || undefined,
          postalCode: this.postalCode() || undefined,
        }),
      );
      this.restaurantId.set(created.id);
      this.step.set(2);
    } catch {
      this.error.set('La création a échoué, réessayez.');
    } finally {
      this.loading.set(false);
    }
  }

  async submitHours(): Promise<void> {
    const id = this.restaurantId();
    if (!id || this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const entries = this.days().flatMap((d) =>
        d.services
          .filter((s) => s.open)
          .map((s) => ({
            restaurantId: id,
            dayOfWeek: d.dayOfWeek,
            service: s.key,
            opensAt: s.opensAt,
            closesAt: s.closesAt,
          })),
      );
      await Promise.all(entries.map((e) => firstValueFrom(this.hours.create(e))));
      this.step.set(3);
    } catch {
      this.error.set("Les horaires n'ont pas pu être enregistrés.");
    } finally {
      this.loading.set(false);
    }
  }

  async submitContext(): Promise<void> {
    const id = this.restaurantId();
    if (!id || this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.restaurants.patchAttributesRestaurant(id, toDto(this.contextStore.context())),
      );
      this.step.set(4);
    } catch {
      this.error.set("Le contexte n'a pas pu être enregistré.");
    } finally {
      this.loading.set(false);
    }
  }

  async finish(skipTables = false): Promise<void> {
    const id = this.restaurantId();
    if (!id || this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.session.refresh();
      if (!skipTables) {
        const count = Math.max(0, this.tableCount());
        const capacity = Math.max(1, this.tableCapacity());
        for (let i = 1; i <= count; i++) {
          await firstValueFrom(this.tablesService.create({ name: `Table ${i}`, capacity }));
        }
      }
      await this.router.navigateByUrl('/dashboard');
    } catch {
      this.error.set('La finalisation a échoué, réessayez.');
    } finally {
      this.loading.set(false);
    }
  }
}
