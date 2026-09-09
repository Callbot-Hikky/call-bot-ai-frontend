import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCreditCard, lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { ReservationPaymentService } from '@core/services/reservation-payment.service';
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
    this.payments.getByPaymentToken(this.token()).subscribe({
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

  protected formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  protected pay(): void {
    if (this.redirecting()) {
      return;
    }
    this.redirecting.set(true);
    this.errorMessage.set(null);

    this.payments.startCheckout(this.token()).subscribe({
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
