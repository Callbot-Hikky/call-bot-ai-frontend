import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucidePhoneCall } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { OfferService } from '@core/services/offer.service';
import type { Offer } from '@core/models/offer.model';

const PRO_OFFER_CODE = 'pro';

@Component({
  selector: 'app-offer-checkout',
  imports: [NgIcon, ...HlmButtonImports, ...HlmCardImports],
  providers: [provideIcons({ lucideCheck, lucidePhoneCall })],
  templateUrl: './offer-checkout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferCheckout {
  private readonly offerService = inject(OfferService);

  private readonly offers = toSignal(this.offerService.getOffers(), {
    initialValue: [] as Offer[],
  });
  protected readonly offer = computed(
    () => this.offers().find((item) => item.code === PRO_OFFER_CODE) ?? null,
  );

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly features: readonly string[] = [
    'Réponse automatique aux appels 24/7',
    'Prise de réservation par téléphone',
    'Transcription et résumé des appels',
    'Support prioritaire',
  ];

  protected formatPrice(offer: Offer): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: offer.currency.toUpperCase(),
      minimumFractionDigits: 0,
    }).format(offer.amountCents / 100);
  }

  protected checkout(): void {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    this.offerService.checkout(PRO_OFFER_CODE).subscribe({
      next: (session) => {
        // Redirection vers la page de paiement hébergée par Stripe.
        window.location.href = session.checkoutUrl;
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set("Impossible d'ouvrir le paiement. Réessayez dans un instant.");
      },
    });
  }
}
