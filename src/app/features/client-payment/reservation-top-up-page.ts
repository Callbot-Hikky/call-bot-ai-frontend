import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCreditCard, lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { ReservationPaymentService } from '@core/services/reservation-payment.service';
import { formatDateTime } from './format';
import { formatCents } from '@core/models/guarantee.model';
import type { PublicTopUp } from '@core/models/guarantee.model';

/**
 * Page de règlement d'un complément de couverts, ouverte depuis le lien reçu par message.
 *
 * <p>Le jeton est distinct de celui du paiement initial : l'un ne règle jamais la dette
 * de l'autre. La page dit deux choses que le convive découvrirait sinon trop tard —
 * sa réservation n'a **pas** encore changé, et la hausse dépend d'une table encore
 * libre au moment du paiement. Rien n'est tenu entre-temps.
 */
@Component({
  selector: 'app-reservation-top-up-page',
  imports: [NgIcon, ...HlmButtonImports, ...HlmCardImports],
  providers: [provideIcons({ lucideCreditCard, lucideTriangleAlert })],
  templateUrl: './reservation-top-up-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationTopUpPage implements OnInit {
  // Alimenté par withComponentInputBinding() depuis le paramètre de route.
  readonly token = input.required<string>();

  private readonly payments = inject(ReservationPaymentService);

  protected readonly topUp = signal<PublicTopUp | null>(null);
  protected readonly loading = signal(true);
  protected readonly redirecting = signal(false);
  protected readonly linkDead = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly amount = computed(() => {
    const current = this.topUp();
    return current ? formatCents(current.amountCents, current.currency) : '';
  });

  protected readonly extraGuests = computed(() => {
    const current = this.topUp();
    return current ? current.targetPartySize - current.currentPartySize : 0;
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.payments.getByTopUpToken(this.token()).subscribe({
      next: (topUp) => {
        this.topUp.set(topUp);
        // `closed` : le délai est passé. Afficher un bouton qui échouera serait pire
        // que de le dire.
        this.linkDead.set(topUp.status !== 'pending');
        this.loading.set(false);
      },
      error: () => {
        this.linkDead.set(true);
        this.loading.set(false);
      },
    });
  }

  protected readonly formatDateTime = formatDateTime;

  protected pay(): void {
    if (this.redirecting()) {
      return;
    }
    this.redirecting.set(true);
    this.errorMessage.set(null);

    this.payments.startTopUpCheckout(this.token()).subscribe({
      next: (redirect) => {
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
