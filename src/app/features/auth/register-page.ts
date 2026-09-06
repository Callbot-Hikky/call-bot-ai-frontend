import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '@core/services/auth.service';
import { SessionService } from '@core/services/session.service';

@Component({
  selector: 'hk-register-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="bg-surface flex min-h-screen items-center justify-center p-4">
      <form
        (ngSubmit)="submit()"
        class="border-border bg-surface-raised w-full max-w-sm space-y-4 rounded-xl border p-6"
      >
        <h1 class="text-fg text-xl font-semibold">Créer un compte</h1>

        <label class="text-fg-muted block text-sm">
          E-mail
          <input
            type="email"
            name="email"
            required
            autocomplete="email"
            [ngModel]="email()"
            (ngModelChange)="email.set($event)"
            class="border-border bg-surface text-fg mt-1 w-full rounded-md border px-3 py-2"
          />
        </label>

        <label class="text-fg-muted block text-sm">
          Mot de passe (8 caractères minimum)
          <input
            type="password"
            name="password"
            required
            minlength="8"
            autocomplete="new-password"
            [ngModel]="password()"
            (ngModelChange)="password.set($event)"
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
          {{ loading() ? 'Création…' : 'Créer mon compte' }}
        </button>

        <p class="text-fg-muted text-sm">
          Déjà un compte ?
          <a routerLink="/login" class="text-primary underline">Se connecter</a>
        </p>
      </form>
    </div>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  async submit(): Promise<void> {
    if (this.loading()) {
      return;
    }
    if (this.password().length < 8) {
      this.error.set('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.auth.register(this.email(), this.password()));
      await this.session.refresh();
      await this.router.navigateByUrl('/onboarding');
    } catch {
      this.error.set('Impossible de créer le compte (e-mail déjà utilisé ?).');
    } finally {
      this.loading.set(false);
    }
  }
}
