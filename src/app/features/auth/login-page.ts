import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '@core/services/auth.service';
import { SessionService } from '@core/services/session.service';

@Component({
  selector: 'hk-login-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="bg-surface-2 flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-md space-y-6 py-8">
        <div class="space-y-1 text-center">
          <p class="text-fg-subtle text-xs font-semibold tracking-[0.2em] uppercase">Alloquence</p>
          <h1 class="text-fg text-2xl font-semibold">Connexion</h1>
          <p class="text-fg-muted text-sm">
            Accédez au tableau de bord de votre restaurant : réservations, plan de salle et appels.
          </p>
        </div>

        <form
          (ngSubmit)="submit()"
          class="border-border bg-surface-raised space-y-5 rounded-xl border p-6"
        >
          <div>
            <label for="login-email" class="text-fg block text-sm font-medium">E-mail</label>
            <input
              id="login-email"
              type="email"
              name="email"
              required
              autocomplete="email"
              placeholder="vous@votre-restaurant.fr"
              [ngModel]="email()"
              (ngModelChange)="email.set($event)"
              class="border-border bg-surface text-fg focus:border-primary mt-1.5 w-full rounded-md border px-3 py-2 outline-none"
            />
            <p class="text-fg-subtle mt-1.5 text-xs">
              Celui utilisé à la création de votre compte.
            </p>
          </div>

          <div>
            <div class="flex items-baseline justify-between">
              <label for="login-password" class="text-fg block text-sm font-medium">
                Mot de passe
              </label>
              <button
                type="button"
                (click)="showPassword.set(!showPassword())"
                class="text-fg-muted hover:text-fg cursor-pointer text-xs underline"
              >
                {{ showPassword() ? 'Masquer' : 'Afficher' }}
              </button>
            </div>
            <input
              id="login-password"
              [type]="showPassword() ? 'text' : 'password'"
              name="password"
              required
              autocomplete="current-password"
              [ngModel]="password()"
              (ngModelChange)="password.set($event)"
              class="border-border bg-surface text-fg focus:border-primary mt-1.5 w-full rounded-md border px-3 py-2 outline-none"
            />
          </div>

          @if (error()) {
            <p
              role="alert"
              class="text-st-cancelled-fg bg-st-cancelled-bg rounded-md px-3 py-2 text-sm"
            >
              {{ error() }}
            </p>
          }

          <button
            type="submit"
            [disabled]="loading()"
            class="bg-primary text-primary-fg w-full cursor-pointer rounded-md px-4 py-2.5 font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {{ loading() ? 'Connexion…' : 'Se connecter' }}
          </button>
        </form>

        <div class="space-y-1 text-center">
          <p class="text-fg-muted text-sm">
            Pas encore de compte ?
            <a routerLink="/register" class="text-primary underline">Créer un compte</a>
          </p>
          <p class="text-fg-subtle text-xs">
            L'inscription comprend le compte, l'abonnement puis la configuration du restaurant.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly showPassword = signal(false);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  async submit(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.auth.login(this.email(), this.password()));
      await this.session.refresh();
      await this.router.navigateByUrl(
        this.session.needsOnboarding() ? '/onboarding' : '/dashboard',
      );
    } catch (err: unknown) {
      this.error.set(this.messageFor(err));
    } finally {
      this.loading.set(false);
    }
  }

  // Distinguer "identifiants faux" d'une panne : un back eteint renvoyait le meme
  // "e-mail ou mot de passe incorrect", qui fait chercher le probleme au mauvais endroit.
  private messageFor(err: unknown): string {
    if (!(err instanceof HttpErrorResponse)) {
      return 'Connexion impossible. Réessayez.';
    }
    switch (err.status) {
      case 0:
        return 'Serveur injoignable. Vérifiez que le backend est démarré.';
      case 401:
      case 403:
        return 'E-mail ou mot de passe incorrect.';
      default:
        return err.status >= 500
          ? 'Le serveur a rencontré une erreur. Réessayez dans un instant.'
          : 'Connexion impossible. Réessayez.';
    }
  }
}
