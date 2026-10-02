import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { OnInit } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCreditCard, lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { ReservationPaymentService } from '@core/services/reservation-payment.service';
import { formatDateTime, formatTime } from './format';
import { formatCents } from '@core/models/guarantee.model';
import type { PublicReservation } from '@core/models/guarantee.model';

/**
 * Page de règlement des frais de réservation, ouverte depuis le lien reçu par message.
 *
 * <p>Le jeton dans l'URL est la seule identification du convive. Le lien mort — délai
 * écoulé, réservation déjà réglée — ne renvoie rien : la page le dit franchement
 * plutôt que d'afficher un formulaire qui échouera.
 */
@Component({
  selector: 'app-reservation-payment-page',
  imports: [NgIcon, ...HlmButtonImports, ...HlmCardImports],
  providers: [provideIcons({ lucideCreditCard, lucideTriangleAlert })],
  templateUrl: './reservation-payment-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationPaymentPage implements OnInit {
  // Alimenté par withComponentInputBinding() depuis le paramètre de route.
  readonly token = input.required<string>();

  private readonly payments = inject(ReservationPaymentService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly reservation = signal<PublicReservation | null>(null);
  protected readonly loading = signal(true);
  protected readonly redirecting = signal(false);
  protected readonly linkDead = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly amount = computed(() => {
    const current = this.reservation();
    return current?.amountCents ? formatCents(current.amountCents, current.currency) : '';
  });

  /**
   * Le mode no-show ne débite rien : la page enregistre une carte. Afficher « à régler »
   * ferait croire à un prélèvement immédiat, ce qui est faux et se retourne en litige.
   */
  protected readonly isNoShow = computed(() => this.reservation()?.guaranteeMode === 'no_show');

  /**
   * L'echeance n'est annoncee QUE si elle est encore devant nous, et seulement le
   * jour meme : le backend bascule le lien en expire paresseusement, donc une page
   * ouverte passe l'heure afficherait sinon « valable jusqu'a 19:30 » a 19:32. Une
   * echeance sur un autre jour est tue plutot que reduite a un HH:MM trompeur.
   */
  protected readonly validUntil = computed(() => {
    const iso = this.reservation()?.expiresAt;
    if (!iso) {
      return null;
    }
    const deadline = new Date(iso);
    const now = new Date();
    if (deadline.getTime() <= now.getTime() || deadline.toDateString() !== now.toDateString()) {
      return null;
    }
    return formatTime(iso);
  });

  protected readonly perGuest = computed(() => {
    const current = this.reservation();
    if (!current?.amountCents || !current.partySize) {
      return '';
    }
    // Arrondi au centime : la règle du fichier de modèles est que tout montant est
    // un entier de centimes, y compris un montant seulement affiché.
    return formatCents(Math.round(current.amountCents / current.partySize), current.currency);
  });

  ngOnInit(): void {
    // Lecture au montage : sans jeton valide il n'y a rien à afficher.
    this.load();
  }

  private load(): void {
    this.payments
      .getByPaymentToken(this.token())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reservation) => {
          this.reservation.set(reservation);
          this.linkDead.set(reservation.guaranteeStatus !== 'awaiting');
          this.loading.set(false);
        },
        error: () => {
          this.linkDead.set(true);
          this.loading.set(false);
        },
      });
  }

  protected readonly formatDateTime = formatDateTime;
  protected readonly formatTime = formatTime;

  protected pay(): void {
    if (this.redirecting()) {
      return;
    }
    this.redirecting.set(true);
    this.errorMessage.set(null);

    this.payments
      .startCheckout(this.token())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (redirect) => {
          // Le paiement lui-même se fait sur la page hébergée par Stripe : aucune donnée
          // bancaire ne traverse jamais Alloquence.
          window.location.href = redirect.url;
        },
        error: () => {
          this.redirecting.set(false);
          this.errorMessage.set(
            "Impossible d'ouvrir le paiement. Le délai est peut-être écoulé : rappelez le restaurant.",
          );
        },
      });
  }
}
