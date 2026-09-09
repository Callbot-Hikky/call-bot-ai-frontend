import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheckBig, lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { ReservationPaymentService } from '@core/services/reservation-payment.service';
import { formatCents } from '@core/models/guarantee.model';
import type { Cancellation, PublicReservation } from '@core/models/guarantee.model';

/**
 * Page d'annulation par le convive, ouverte depuis son lien.
 *
 * <p>Le jeton d'annulation est distinct du jeton de paiement : il survit au règlement,
 * puisque c'est justement après avoir payé qu'on peut avoir besoin d'annuler.
 *
 * <p>Le sort de l'argent est annoncé <em>avant</em> le clic, jamais après : personne ne
 * doit découvrir qu'il perd ses frais une fois la table rendue.
 */
@Component({
  selector: 'app-reservation-cancel-page',
  imports: [NgIcon, ...HlmButtonImports, ...HlmCardImports],
  providers: [provideIcons({ lucideCircleCheckBig, lucideTriangleAlert })],
  templateUrl: './reservation-cancel-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationCancelPage implements OnInit {
  readonly token = input.required<string>();

  private readonly payments = inject(ReservationPaymentService);

  protected readonly reservation = signal<PublicReservation | null>(null);
  protected readonly result = signal<Cancellation | null>(null);
  protected readonly loading = signal(true);
  protected readonly cancelling = signal(false);
  protected readonly linkDead = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly amount = computed(() => {
    const current = this.reservation();
    return current?.amountCents ? formatCents(current.amountCents, current.currency) : '';
  });

  protected readonly alreadyCancelled = computed(() => this.reservation()?.status === 'cancelled');

  /**
   * Le remboursement dépend de la fenêtre figée sur la réservation, calculée ici pour
   * l'annoncer d'avance. Le backend refait le calcul : cet affichage n'est qu'informatif.
   */
  protected readonly willBeRefunded = computed(() => {
    const current = this.reservation();
    if (!current || current.guaranteeStatus !== 'secured') {
      return false;
    }
    const windowHours = current.refundWindowHours ?? 0;
    const deadline = new Date(current.startsAt).getTime() - windowHours * 3_600_000;
    return Date.now() < deadline;
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.payments.getByCancellationToken(this.token()).subscribe({
      next: (reservation) => {
        this.reservation.set(reservation);
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

  protected formatRefund(cents: number | null): string {
    const current = this.reservation();
    return cents ? formatCents(cents, current?.currency ?? 'eur') : '';
  }

  protected confirmCancellation(): void {
    if (this.cancelling()) {
      return;
    }
    this.cancelling.set(true);
    this.errorMessage.set(null);

    this.payments.cancel(this.token()).subscribe({
      next: (result) => {
        this.result.set(result);
        this.cancelling.set(false);
      },
      error: () => {
        this.cancelling.set(false);
        this.errorMessage.set("L'annulation n'a pas abouti. Appelez le restaurant.");
      },
    });
  }
}
