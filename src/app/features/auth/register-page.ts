import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '@core/services/auth.service';
import { SessionService } from '@core/services/session.service';

const MIN_PASSWORD_LENGTH = 8;

@Component({
  selector: 'hk-register-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="bg-surface-2 flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-md space-y-6 py-8">
        <div class="space-y-1 text-center">
          <p class="text-fg-subtle text-xs font-semibold tracking-[0.2em] uppercase">Alloquence</p>
          <h1 class="text-fg text-2xl font-semibold">Créer votre compte</h1>
          <p class="text-fg-muted text-sm">
            Le compte d'accès à votre espace restaurateur. Il vous servira ensuite à suivre les
            réservations prises par téléphone.
          </p>
        </div>

        <!-- Le parcours complet, affiche des la premiere etape : le restaurateur sait
             ou il met les pieds avant de saisir quoi que ce soit. -->
        <ol class="flex items-start gap-2" aria-label="Étapes de l'inscription">
          @for (s of steps; track s.n) {
            <li class="flex-1 space-y-1.5">
              <div
                class="h-1 rounded-full"
                [class.bg-primary]="s.n === 1"
                [class.bg-border]="s.n !== 1"
              ></div>
              <p
                class="text-xs leading-tight"
                [class.text-fg]="s.n === 1"
                [class.font-medium]="s.n === 1"
                [class.text-fg-subtle]="s.n !== 1"
              >
                {{ s.n }}. {{ s.label }}
              </p>
            </li>
          }
        </ol>

        <form
          (ngSubmit)="submit()"
          class="border-border bg-surface-raised space-y-5 rounded-xl border p-6"
        >
          <div>
            <label for="register-email" class="text-fg block text-sm font-medium">E-mail</label>
            <input
              id="register-email"
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
              Sert d'identifiant de connexion et reçoit les notifications de réservation.
            </p>
          </div>

          <div>
            <div class="flex items-baseline justify-between">
              <label for="register-password" class="text-fg block text-sm font-medium">
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
              id="register-password"
              [type]="showPassword() ? 'text' : 'password'"
              name="password"
              required
              [minlength]="minLength"
              autocomplete="new-password"
              [ngModel]="password()"
              (ngModelChange)="password.set($event)"
              class="border-border bg-surface text-fg focus:border-primary mt-1.5 w-full rounded-md border px-3 py-2 outline-none"
            />
            <p
              class="mt-1.5 text-xs"
              [class.text-fg-subtle]="!tooShort()"
              [class.text-fg]="tooShort()"
            >
              {{ minLength }} caractères minimum{{ remainingLabel() }}.
            </p>
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
            {{ loading() ? 'Création…' : 'Créer mon compte' }}
          </button>

          <p class="text-fg-subtle text-center text-xs">
            Prochaine étape : l'abonnement Pro à 99 € / mois. Aucun prélèvement à cette étape-ci.
          </p>
        </form>

        <p class="text-fg-muted text-center text-sm">
          Déjà un compte ?
          <a routerLink="/login" class="text-primary underline">Se connecter</a>
        </p>
      </div>
    </div>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly steps = [
    { n: 1, label: 'Compte' },
    { n: 2, label: 'Abonnement' },
    { n: 3, label: 'Configuration' },
  ];

  readonly email = signal('');
  readonly password = signal('');
  readonly showPassword = signal(false);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  protected readonly tooShort = computed(
    () => this.password().length > 0 && this.password().length < MIN_PASSWORD_LENGTH,
  );

  protected readonly remainingLabel = computed(() => {
    const missing = MIN_PASSWORD_LENGTH - this.password().length;

    return this.tooShort() ? ` — encore ${missing}` : '';
  });

  async submit(): Promise<void> {
    if (this.loading()) {
      return;
    }
    if (this.password().length < MIN_PASSWORD_LENGTH) {
      this.error.set(`Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`);

      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.auth.register(this.email(), this.password()));
      await this.session.refresh();
      // Etape suivante de l'inscription : souscription a l'offre Pro (99 EUR/mois).
      // L'onboarding du restaurant se fait apres le paiement.
      await this.router.navigateByUrl('/offre');
    } catch (err: unknown) {
      this.error.set(this.messageFor(err));
    } finally {
      this.loading.set(false);
    }
  }

  // Un message par cause reelle : un 500 (back eteint) affiche autrefois
  // "e-mail deja utilise ?", ce qui envoyait chercher le probleme au mauvais endroit.
  private messageFor(err: unknown): string {
    if (!(err instanceof HttpErrorResponse)) {
      return 'Impossible de créer le compte. Réessayez.';
    }
    switch (err.status) {
      case 0:
        return 'Serveur injoignable. Vérifiez que le backend est démarré.';
      case 400:
        return 'E-mail ou mot de passe invalide.';
      case 409:
        return 'Un compte existe déjà avec cet e-mail. Connectez-vous.';
      default:
        return err.status >= 500
          ? 'Le serveur a rencontré une erreur. Réessayez dans un instant.'
          : 'Impossible de créer le compte. Réessayez.';
    }
  }
}
