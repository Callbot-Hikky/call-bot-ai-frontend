import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { RestaurantService } from '@core/services/restaurant.service';
import { SessionService } from '@core/services/session.service';

@Component({
  selector: 'hk-onboarding-page',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="bg-surface flex min-h-screen items-center justify-center p-4">
      <form
        (ngSubmit)="submit()"
        class="border-border bg-surface-raised w-full max-w-md space-y-4 rounded-xl border p-6"
      >
        <h1 class="text-fg text-xl font-semibold">Votre restaurant</h1>
        <p class="text-fg-muted text-sm">
          Dernière étape : renseignez votre établissement. Le numéro de téléphone est celui sur
          lequel l'assistant vocal recevra les appels.
        </p>

        <label class="text-fg-muted block text-sm">
          Nom du restaurant
          <input
            type="text"
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
            type="tel"
            name="phone"
            required
            placeholder="+33 1 00 00 00 00"
            [ngModel]="phone()"
            (ngModelChange)="phone.set($event)"
            class="border-border bg-surface text-fg mt-1 w-full rounded-md border px-3 py-2"
          />
        </label>

        @if (error()) {
          <p class="text-st-cancelled-fg text-sm">{{ error() }}</p>
        }

        <button
          type="submit"
          [disabled]="loading()"
          class="bg-primary text-primary-fg w-full rounded-md px-4 py-2 font-medium disabled:opacity-60"
        >
          {{ loading() ? 'Création…' : 'Terminer' }}
        </button>
      </form>
    </div>
  `,
})
export class OnboardingPage {
  private readonly restaurants = inject(RestaurantService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly name = signal('');
  readonly phone = signal('');
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  async submit(): Promise<void> {
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
      await firstValueFrom(
        this.restaurants.create({
          organizationId,
          name: this.name(),
          phoneNumber: this.phone(),
        }),
      );
      await this.session.refresh();
      await this.router.navigateByUrl('/dashboard');
    } catch {
      this.error.set('La création a échoué, réessayez.');
    } finally {
      this.loading.set(false);
    }
  }
}
